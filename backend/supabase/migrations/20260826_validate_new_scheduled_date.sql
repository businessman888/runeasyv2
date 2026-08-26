-- Troca de Dias T.0 — A FRONTEIRA DO DESTINO.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- A MINA QUE ESTA MIGRATION FECHA
-- ══════════════════════════════════════════════════════════════════════════════
--
-- `apply_plan_adaptation` (20260815) reafirma a fronteira de edição no `WHERE`
-- do UPDATE:
--
--     AND w.status = 'pending'
--     AND w.scheduled_date > p_today
--
-- Um `WHERE` de UPDATE é avaliado contra a linha ANTIGA. Ele garante que o
-- treino ESTAVA no futuro. Ele NÃO diz nada sobre para onde o treino VAI:
--
--     SET scheduled_date = coalesce((v_set->>'scheduled_date')::date, ...)
--
-- A data NOVA não é validada em camada nenhuma — nem aqui, nem em
-- `isEditableWorkout` (que checa a data ATUAL da linha), nem em DTO.
--
-- Isso nunca apareceu porque NENHUM caller de produção põe `scheduled_date` num
-- `set`: a 6.2 e a 6.3 escrevem `distance_km`/`instructions_json`, a Fase 3
-- escreve `instructions_json`, e a re-âncora usa a função SEPARADA
-- `apply_schedule_shift`. A Troca de Dias é a PRIMEIRA a remapear datas por
-- aqui, e é ela que expõe o buraco.
--
-- A reauditoria varreu 116.620 remapeamentos (7 âncoras de início × todos os
-- pares de trios de dias × 7 posições de "hoje" × 2 escopos) e mediu:
--
--     17,2% jogariam ao menos um treino pendente para HOJE ou para o PASSADO.
--
-- E o dano não para na escrita: `getScheduleWithStatus` carimba `missed` em
-- pendentes vencidos de um Pro. O corredor trocaria os dias, abriria a agenda, e
-- encontraria treinos "perdidos" que ele nunca teve chance de fazer — criados
-- pela própria ação dele, com o histórico registrando que foi o app.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE NO CORPO, E NÃO NO `WHERE`
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A alternativa óbvia seria estender o `WHERE`:
--
--     AND (v_set->>'scheduled_date' IS NULL
--          OR (v_set->>'scheduled_date')::date > p_today)
--
-- Ela funciona e foi DESCARTADA por um motivo concreto: um `WHERE` só sabe
-- responder via `ROW_COUNT`, e `v_rows <> 1` já significa outras seis coisas
-- (alguém concluiu o treino, a F3 reprecificou, é dia de prova, o id não é deste
-- plano…). Todas colapsam no mesmo `row_conflict` genérico.
--
-- E `row_conflict` é RETENTÁVEL por contrato: quem o recebe recalcula a preview
-- e pede reconfirmação. Uma data no passado NÃO é retentável — recalcular não
-- muda nada, a data continuaria no passado. Devolver `row_conflict` aqui
-- mandaria o chamador para um laço que nunca converge.
--
-- A validação no corpo roda na MESMA transação, ANTES de qualquer escrita, e a
-- garantia é idêntica — com a diferença de poder dizer o próprio nome.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- CONDICIONADA A `v_set ? 'scheduled_date'` — O NO-OP É O PONTO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Esta função é compartilhada por três features EM PRODUÇÃO (F3, 6.2, 6.3).
-- Nenhuma delas move data. A guarda é literalmente INALCANÇÁVEL para elas: sem a
-- chave `scheduled_date` no `set`, o `IF` é falso e nada acontece.
--
-- Isso não é detalhe de implementação — é o contrato desta migration, e há teste
-- de regressão dedicado provando que as três seguem idênticas.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- A EXPRESSÃO É A MESMA DO `WHERE`, DE PROPÓSITO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- `<= p_today` é a negação exata de `> p_today`, que é o que o `WHERE` já aplica
-- à linha antiga. Origem e destino passam pela MESMA régua — é isso que torna a
-- paridade com `isEditableTargetDate` (TypeScript) verificável linha a linha, no
-- mesmo molde do teste que já existe para `isEditableWorkout`.
--
-- ── O QUE ESTA GUARDA NÃO É ───────────────────────────────────────────────────
--
-- Ela NÃO cobre a virada da meia-noite. Uma preview às 23h59 e um apply às 00h01
-- já conflitam por conta própria: `plan_state_digest` depende de `p_today`, e a
-- janela editável muda quando a fronteira anda. Isso é `revision_conflict`,
-- retentável, e continua sendo tratado como sempre foi.
--
-- Ela também NÃO cobre colisão de duas sessões no mesmo dia nem uma data nova
-- caindo em cima do dia da prova. Essas são responsabilidade da camada de
-- cálculo (T.1), que escolhe os destinos.
--
-- ── DATA MALFORMADA: DIVERGÊNCIA DELIBERADA COM O TYPESCRIPT ──────────────────
--
-- `(v_set->>'scheduled_date')::date` com lixo dentro levanta
-- `invalid_datetime_format` — outro SQLSTATE, que continua PROPAGANDO como o
-- erro de programação que é. O espelho em TypeScript devolve isso estruturado
-- (ele não tem cast que estoure). A divergência é consciente: o único produtor
-- destas datas é código nosso, que as monta com `addDaysStr`. O teste de
-- paridade varre apenas datas bem formadas.

CREATE OR REPLACE FUNCTION public.apply_plan_adaptation(
  p_user_id              uuid,
  p_plan_id              uuid,
  p_today                date,
  p_expected_digest      text,
  p_idempotency_key      text,
  p_kind                 text,
  p_patch                jsonb,
  p_invalidate_briefings boolean DEFAULT true,
  p_meta                 jsonb   DEFAULT '{}'::jsonb,
  p_plan_patch           jsonb   DEFAULT NULL,
  p_vdot_history         jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_plan            record;
  v_existing        record;
  v_current_digest  text;
  v_digest_after    text;
  v_item            jsonb;
  v_wid             uuid;
  v_set             jsonb;
  v_expected        jsonb;
  v_before          jsonb;
  v_after           jsonb;
  v_rows            integer;
  v_workout_ids     uuid[] := ARRAY[]::uuid[];
  v_changes         jsonb  := '[]'::jsonb;
  v_briefings       integer := 0;
  v_adaptation_id   uuid;
  v_new_status      text;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'array' THEN
    RAISE EXCEPTION 'apply_plan_adaptation: p_patch precisa ser um array jsonb';
  END IF;

  IF jsonb_array_length(p_patch) = 0
     AND p_vdot_history IS NULL
     AND p_plan_patch IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'empty_patch');
  END IF;

  -- ── 1. LOCK + PROPRIEDADE + PLANO ATIVO, num passo ─────────────────────────
  SELECT id, status, generation_status
    INTO v_plan
    FROM public.training_plans
   WHERE id = p_plan_id
     AND user_id = p_user_id
     AND status = 'active'
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'plan_not_editable');
  END IF;

  IF v_plan.generation_status IS DISTINCT FROM 'complete' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'plan_generating');
  END IF;

  -- ── 2. IDEMPOTÊNCIA — antes de qualquer escrita ────────────────────────────
  SELECT id, digest_after, workout_ids, briefings_invalidated
    INTO v_existing
    FROM public.plan_adaptations
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'applied',       true,
      'replayed',      true,
      'adaptation_id', v_existing.id,
      'digest_after',  v_existing.digest_after,
      'affected',      jsonb_build_object(
                         'workouts',  coalesce(array_length(v_existing.workout_ids, 1), 0),
                         'briefings', v_existing.briefings_invalidated));
  END IF;

  -- ── 3. DIGEST — concorrência otimista no nível do agregado ─────────────────
  v_current_digest := public.plan_state_digest(p_plan_id, p_today);

  IF v_current_digest IS DISTINCT FROM p_expected_digest THEN
    RETURN jsonb_build_object(
      'applied',        false,
      'reason',         'revision_conflict',
      'current_digest', v_current_digest);
  END IF;

  -- ── 4. APLICA — tudo ou nada ───────────────────────────────────────────────
  BEGIN
    FOREACH v_item IN ARRAY ARRAY(SELECT jsonb_array_elements(p_patch))
    LOOP
      v_wid      := (v_item->>'workout_id')::uuid;
      v_set      := v_item->'set';
      v_expected := v_item->'expected';

      IF v_wid IS NULL THEN
        RAISE EXCEPTION 'patch sem workout_id';
      END IF;
      IF v_set IS NULL OR jsonb_typeof(v_set) <> 'object' THEN
        RAISE EXCEPTION 'patch de % sem objeto "set"', v_wid;
      END IF;
      IF v_expected IS NULL OR v_expected->>'status' IS NULL THEN
        RAISE EXCEPTION 'patch de % sem expected.status', v_wid;
      END IF;
      IF v_set ? 'instructions_json'
         AND v_expected->>'instructions_md5' IS NULL THEN
        RAISE EXCEPTION 'patch de % reescreve instructions_json sem expected.instructions_md5', v_wid;
      END IF;
      IF v_set ? 'instructions_json'
         AND jsonb_typeof(v_set->'instructions_json') <> 'array' THEN
        RAISE EXCEPTION 'instructions_json de % precisa ser array', v_wid;
      END IF;

      v_new_status := v_set->>'status';
      IF v_new_status IS NOT NULL
         AND v_new_status NOT IN ('pending', 'skipped', 'missed') THEN
        RAISE EXCEPTION 'status "%" não é aplicável por adaptação', v_new_status;
      END IF;

      -- ── ✦ A FRONTEIRA DO DESTINO (Troca de Dias T.0) ✦ ─────────────────────
      --
      -- A ÚNICA mudança desta migration. Ver o cabeçalho para o porquê de estar
      -- aqui e não no `WHERE`, e para o porquê de `RE422` e não `RE409`.
      --
      -- `RE422` (não retentável) vs `RE409` (retentável) é a distinção que faz
      -- este RAISE valer a pena: recalcular a preview não conserta uma data no
      -- passado.
      IF v_set ? 'scheduled_date'
         AND (v_set->>'scheduled_date')::date <= p_today THEN
        RAISE EXCEPTION 'new_date_in_past:% -> %', v_wid, v_set->>'scheduled_date'
          USING ERRCODE = 'RE422';
      END IF;

      SELECT jsonb_build_object(
               'status',            w.status,
               'scheduled_date',    w.scheduled_date,
               'distance_km',       w.distance_km,
               'instructions_json', w.instructions_json)
        INTO v_before
        FROM public.workouts w
       WHERE w.id = v_wid;

      UPDATE public.workouts w
         SET status            = coalesce(v_set->>'status', w.status),
             scheduled_date    = coalesce((v_set->>'scheduled_date')::date, w.scheduled_date),
             distance_km       = coalesce((v_set->>'distance_km')::double precision, w.distance_km),
             instructions_json = coalesce(v_set->'instructions_json', w.instructions_json)
       WHERE w.id = v_wid
         -- ── A FRONTEIRA DE ORIGEM, REAFIRMADA NO SQL ───────────────────────
         AND w.plan_id = p_plan_id
         AND w.user_id = p_user_id
         AND w.status  = 'pending'
         AND w.scheduled_date > p_today
         AND coalesce(w.is_race_day, false) = false
         -- ── COMPARE-AND-SWAP POR LINHA ─────────────────────────────────────
         AND w.status = v_expected->>'status'
         AND (v_expected->>'instructions_md5' IS NULL
              OR md5(coalesce(w.instructions_json::text, '')) = v_expected->>'instructions_md5')
      RETURNING jsonb_build_object(
                  'status',            w.status,
                  'scheduled_date',    w.scheduled_date,
                  'distance_km',       w.distance_km,
                  'instructions_json', w.instructions_json)
           INTO v_after;

      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'row_conflict:%', v_wid USING ERRCODE = 'RE409';
      END IF;

      v_workout_ids := v_workout_ids || v_wid;
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
                     'workout_id', v_wid,
                     'before',     v_before,
                     'after',      v_after));
    END LOOP;

    -- ── Artefatos derivados ──────────────────────────────────────────────────
    IF p_invalidate_briefings THEN
      WITH del AS (
        DELETE FROM public.workout_briefings
         WHERE workout_id = ANY(v_workout_ids)
        RETURNING 1
      )
      SELECT count(*) INTO v_briefings FROM del;
    END IF;

    -- ── A linha do plano ─────────────────────────────────────────────────────
    UPDATE public.training_plans
       SET vdot_current = coalesce((p_plan_patch->>'vdot_current')::numeric, vdot_current),
           last_adaptation_at = now()
     WHERE id = p_plan_id;

    -- ── Histórico do VDOT (Fase 3), na MESMA transação ───────────────────────
    IF p_vdot_history IS NOT NULL THEN
      INSERT INTO public.plan_vdot_history
        (user_id, plan_id, vdot_before, vdot_after, source, reason,
         week_number, sample_size, avg_delta_seconds, evidence)
      VALUES
        (p_user_id, p_plan_id,
         (p_vdot_history->>'vdot_before')::numeric,
         (p_vdot_history->>'vdot_after')::numeric,
         coalesce(p_vdot_history->>'source', 'reestimate'),
         p_vdot_history->>'reason',
         (p_vdot_history->>'week_number')::integer,
         (p_vdot_history->>'sample_size')::integer,
         (p_vdot_history->>'avg_delta_seconds')::integer,
         p_vdot_history->'evidence');
    END IF;

    v_digest_after := public.plan_state_digest(p_plan_id, p_today);

    INSERT INTO public.plan_adaptations
      (user_id, plan_id, source, source_insight_id, kind, reason, reason_code,
       metrics, digest_before, digest_after, applied_today, week_number,
       window_start, window_end, workout_ids, changes, briefings_invalidated,
       idempotency_key)
    VALUES
      (p_user_id, p_plan_id,
       coalesce(p_meta->>'source', 'manual'),
       (p_meta->>'source_insight_id')::uuid,
       p_kind,
       p_meta->>'reason',
       p_meta->>'reason_code',
       p_meta->'metrics',
       p_expected_digest,
       v_digest_after,
       p_today,
       (p_meta->>'week_number')::integer,
       (p_meta->>'window_start')::date,
       (p_meta->>'window_end')::date,
       v_workout_ids,
       v_changes,
       v_briefings,
       p_idempotency_key)
    RETURNING id INTO v_adaptation_id;

  EXCEPTION
    WHEN sqlstate 'RE409' THEN
      RETURN jsonb_build_object(
        'applied',        false,
        'reason',         'row_conflict',
        'detail',         SQLERRM,
        'current_digest', public.plan_state_digest(p_plan_id, p_today));

    -- ── ✦ A recusa da data destino (Troca de Dias T.0) ✦ ─────────────────────
    --
    -- SEM `current_digest`, e a ausência é o contrato: `row_conflict` e
    -- `revision_conflict` devolvem o digest porque o chamador deve recalcular a
    -- preview e reconfirmar. Aqui recalcular não muda nada — a data continuaria
    -- no passado. Entregar um digest convidaria justamente ao retry que não
    -- converge.
    --
    -- Com a camada de cálculo correta isto é IMPOSSÍVEL em uso normal: os dois
    -- modos da Troca de Dias evitam o passado por construção (Modo 1 começa na
    -- próxima semana) e por filtragem (Modo 2 só oferece dias futuros). Se este
    -- retorno aparecer, é defeito na camada de cima — e é por isso que o serviço
    -- o loga em ERROR, não em WARN.
    WHEN sqlstate 'RE422' THEN
      RETURN jsonb_build_object(
        'applied', false,
        'reason',  'new_date_in_past',
        'detail',  SQLERRM);

    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'applied',  true,
        'replayed', true,
        'reason',   'concurrent_replay');
  END;

  RETURN jsonb_build_object(
    'applied',       true,
    'replayed',      false,
    'adaptation_id', v_adaptation_id,
    'digest_after',  v_digest_after,
    'affected',      jsonb_build_object(
                       'workouts',  coalesce(array_length(v_workout_ids, 1), 0),
                       'briefings', v_briefings));
END;
$$;

COMMENT ON FUNCTION public.apply_plan_adaptation(uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb) IS
  'A operação atômica da Fase 6: lock do plano, compare-and-swap por digest e por linha, aplicação do patch (whitelist de 4 colunas), invalidação de briefings e histórico — tudo numa transação. Não calcula nada: recebe um patch já decidido em TypeScript. Conflito é RETORNO, não exceção; falha parcial é impossível por construção. Desde a T.0 da Troca de Dias, a fronteira vale também para a data DESTINO: um patch que moveria um treino para hoje ou para o passado é recusado com `new_date_in_past` (não retentável), sem escrever nada.';

-- ── Server-only ───────────────────────────────────────────────────────────────
-- `CREATE OR REPLACE` preserva os grants existentes; reafirmar é barato e mantém
-- o arquivo autossuficiente para quem o ler isolado.
REVOKE ALL ON FUNCTION public.apply_plan_adaptation(uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_plan_adaptation(uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb) TO service_role;
