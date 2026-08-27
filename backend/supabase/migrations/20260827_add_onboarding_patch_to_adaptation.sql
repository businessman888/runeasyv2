-- Troca de Dias T.1 — a Mina 4: os dias escolhidos, na MESMA transação.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- O PROBLEMA
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A Troca de Dias remapeia `workouts.scheduled_date`. Mas o registro de "quais
-- dias o corredor treina" mora em OUTRO lugar, e é ele que a GERAÇÃO lê.
-- Remapear as datas sem atualizar esse registro faz a troca ser desfeita em
-- silêncio no próximo plano gerado — a Mina 4 da reauditoria.
--
-- ── ONDE OS DIAS MORAM (e não é onde se esperava) ─────────────────────────────
--
-- Não em `training_plans`: essa tabela não tem coluna de dias nenhuma. Moram em
-- `user_onboarding`, uma tabela POR-USUÁRIO (não por-plano), e em DOIS lugares:
--
--     user_onboarding.available_days              jsonb
--     user_onboarding.responses_json->'available_days'
--
-- E o segundo tem PRECEDÊNCIA. Os dois leitores fazem
-- `const dto = onboarding.responses_json || onboarding` e consultam
-- `dto.available_days` primeiro:
--
--     training.controller.ts        → POST /training/onboarding/generate
--     revenuecat-webhook.service.ts → reativação sem plano ativo
--
-- Medido nos dois ambientes: 23/23 linhas de produção têm as duas cópias, hoje
-- concordando. **Escrever só a coluna não teria efeito nenhum** — o
-- `responses_json` venceria e os dias antigos voltariam.
--
-- Por isso o UPDATE abaixo escreve as DUAS.
--
-- ── DÍVIDA REGISTRADA ─────────────────────────────────────────────────────────
--
-- Duas cópias do mesmo dado que precisam concordar por disciplina é exatamente a
-- forma da mina 2 da Fase 6.1. A correção de RAIZ seria a geração derivar os
-- dias do CALENDÁRIO do plano anterior (a verdade materializada) em vez de ler
-- `user_onboarding` — o mesmo princípio que a T.1 aplica ao decidir a quantidade
-- de dias. Ficou fora do escopo da T.1 porque mexe em caminho de geração; está
-- anotado aqui para não se perder.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE UM PARÂMETRO NOVO, E POR QUE `DROP` + `CREATE`
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A escrita PRECISA ser atômica com o remapeamento: datas novas + dias velhos é
-- justamente o estado que a Mina 4 descreve, e "aplicou metade" é o que a
-- Fase 6.1 existe para tornar impossível.
--
-- O precedente é exato: `p_plan_patch` e `p_vdot_history` entraram na 20260815
-- pelo mesmo motivo — a Fase 3 precisava de escrita adicional dentro da mesma
-- fronteira, com whitelist explícita. `p_onboarding_patch` é o terceiro caso, e
-- sua whitelist tem UMA chave: `available_days`.
--
-- ⚠️ `CREATE OR REPLACE` NÃO SERVE AQUI. Parâmetro novo muda a assinatura, e o
-- Postgres criaria uma SEGUNDA função (11 params + 12 params) em vez de
-- substituir — com o PostgREST livre para resolver a antiga, sem a escrita de
-- `user_onboarding`. Daí o `DROP FUNCTION` explícito da assinatura de 11.
-- (A T.0 já deixou "apply_plan_adaptation SEM sobrecarga" como verificação de
-- aceite, justamente por isso.)
--
-- ── COMPATIBILIDADE COM O CÓDIGO ATUAL ────────────────────────────────────────
--
-- O 12º parâmetro tem `DEFAULT NULL` e o backend chama por parâmetros NOMEADOS
-- (`p_user_id => …`), então uma chamada com as 11 chaves de hoje continua
-- resolvendo. F3, 6.2 e 6.3 seguem funcionando sem tocar numa linha.
--
-- Ainda assim: migration e código sobem JUNTOS. Entre o DROP e o CREATE não
-- existe função nenhuma, e essa janela é a própria transação da migration.

DROP FUNCTION IF EXISTS public.apply_plan_adaptation(
  uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb);

CREATE FUNCTION public.apply_plan_adaptation(
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
  p_vdot_history         jsonb   DEFAULT NULL,
  -- Troca de Dias T.1 — whitelist de UMA chave: `available_days`.
  p_onboarding_patch     jsonb   DEFAULT NULL
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
  v_days            jsonb;
  v_onboarding_rows integer := 0;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'array' THEN
    RAISE EXCEPTION 'apply_plan_adaptation: p_patch precisa ser um array jsonb';
  END IF;

  -- Patch vazio COM escrita de onboarding continua sendo no-op: a Troca de Dias
  -- nunca manda dias novos sem treinos a remapear, e aceitar isso permitiria
  -- reescrever `available_days` sem mexer no calendário — as duas fontes
  -- divergiriam pela própria porta que existe para mantê-las juntas.
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

      -- ── A FRONTEIRA DO DESTINO (Troca de Dias T.0) ─────────────────────────
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

    -- ── ✦ OS DIAS ESCOLHIDOS (Troca de Dias T.1) ✦ ──────────────────────────
    --
    -- As DUAS cópias, na mesma transação do remapeamento. Ver o cabeçalho:
    -- `responses_json` tem precedência na leitura, então escrever só a coluna
    -- seria um no-op silencioso.
    --
    -- `jsonb_set` com `create_if_missing` (default true) cobre a linha que ainda
    -- não tem a chave. O `CASE` cobre `responses_json` NULL — `jsonb_set(NULL, …)`
    -- devolve NULL e apagaria o blob inteiro de respostas do onboarding.
    IF p_onboarding_patch IS NOT NULL AND p_onboarding_patch ? 'available_days' THEN
      v_days := p_onboarding_patch->'available_days';

      IF jsonb_typeof(v_days) <> 'array' THEN
        RAISE EXCEPTION 'available_days precisa ser array jsonb, veio %',
          jsonb_typeof(v_days);
      END IF;

      UPDATE public.user_onboarding
         SET available_days = v_days,
             responses_json = CASE
                                WHEN responses_json IS NULL THEN responses_json
                                ELSE jsonb_set(responses_json, '{available_days}', v_days)
                              END
       WHERE user_id = p_user_id;

      GET DIAGNOSTICS v_onboarding_rows = ROW_COUNT;
      -- Zero linhas NÃO é erro: um usuário pode ter plano ativo sem linha de
      -- onboarding (plano criado por rota administrativa). O contador vai para o
      -- histórico para a ausência ficar auditável em vez de invisível.
    END IF;

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
       -- O contador de onboarding entra nas métricas quando a escrita foi
       -- pedida: é o que responde "a troca atualizou os dias, ou só as datas?"
       CASE
         WHEN p_onboarding_patch IS NULL THEN p_meta->'metrics'
         ELSE coalesce(p_meta->'metrics', '{}'::jsonb)
              || jsonb_build_object('onboarding_rows', v_onboarding_rows)
       END,
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

    WHEN sqlstate 'RE422' THEN
      -- Sem `current_digest`: não é conflito de concorrência, e recalcular a
      -- preview não muda nada — a data continuaria no passado.
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
    -- `onboarding` só aparece para quem PEDIU a escrita.
    --
    -- Acrescentá-lo incondicionalmente mudaria a FORMA da resposta de F3, 6.2 e
    -- 6.3 — features que não pediram nada e que têm testes comparando o objeto
    -- `affected` inteiro. Um campo a mais é mudança de contrato, por menor que
    -- pareça, e o compromisso desta fase é que a primitiva compartilhada siga
    -- idêntica para quem não usa o recurso novo.
    'affected',      CASE
                       WHEN p_onboarding_patch IS NULL THEN
                         jsonb_build_object(
                           'workouts',  coalesce(array_length(v_workout_ids, 1), 0),
                           'briefings', v_briefings)
                       ELSE
                         jsonb_build_object(
                           'workouts',   coalesce(array_length(v_workout_ids, 1), 0),
                           'briefings',  v_briefings,
                           'onboarding', v_onboarding_rows)
                     END);
END;
$$;

COMMENT ON FUNCTION public.apply_plan_adaptation(uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb, jsonb) IS
  'A operação atômica da Fase 6: lock do plano, compare-and-swap por digest e por linha, aplicação do patch (whitelist de 4 colunas), invalidação de briefings e histórico — tudo numa transação. Não calcula nada: recebe um patch já decidido em TypeScript. Conflito é RETORNO, não exceção; falha parcial é impossível por construção. A fronteira vale também para a data DESTINO (T.0): mover um treino para hoje ou o passado devolve `new_date_in_past`, não retentável. E `p_onboarding_patch` (T.1) grava os dias escolhidos em `user_onboarding` — coluna E `responses_json`, que tem precedência na leitura — na MESMA transação do remapeamento.';

-- ── Server-only ───────────────────────────────────────────────────────────────
--
-- `DROP` + `CREATE` cria uma função NOVA, que herda os DEFAULT PRIVILEGES do
-- Supabase (EXECUTE para `anon` e `authenticated`). Os REVOKEs abaixo precisam
-- ser repetidos aqui — sem eles, a função voltaria a ficar alcançável pelo Data
-- API mesmo que `20260826_revoke_foundation_fns_from_data_api.sql` já tenha
-- rodado. É o mesmo motivo pelo qual aquela migration existe.
REVOKE ALL ON FUNCTION public.apply_plan_adaptation(uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;

DO $$
DECLARE
  v_fn text := 'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb,jsonb)';
  v_papel text;
BEGIN
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_papel) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_fn, v_papel);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END IF;
END;
$$;

-- ── Rede de segurança: exatamente UMA função, com 12 parâmetros ───────────────
--
-- Se o DROP não tivesse pegado, existiriam duas (11 e 12 params) e o PostgREST
-- poderia resolver a antiga — sem a escrita de `user_onboarding`, e a Mina 4
-- continuaria aberta em silêncio.
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'apply_plan_adaptation';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'esperava 1 apply_plan_adaptation, encontrei % — o DROP da assinatura antiga não pegou e o PostgREST poderia chamar a versão sem p_onboarding_patch',
      v_n;
  END IF;

  RAISE NOTICE '[T.1] apply_plan_adaptation → 12 params, sem sobrecarga, server-only';
END;
$$;
