-- Fase 6.1 — A OPERAÇÃO ATÔMICA. O chão de toda a Fase 6.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE ISTO É UMA FUNÇÃO POSTGRES, E NÃO CÓDIGO NESTJS
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O backend fala SÓ PostgREST (`@supabase/supabase-js`). Não há `pg`, não há
-- Prisma, não há pool de conexões: cada `.from().update()` é uma requisição HTTP
-- e, portanto, uma transação própria. Uma sequência de chamadas do serviço nunca
-- é atômica — e a reauditoria mostrou o preço disso em produção:
--
--   • `missed → pending` confirma e o shift falha;
--   • o shift confirma e `adjustment_applied_at` falha;
--   • paces mudam em parte dos treinos e o VDOT avança assim mesmo;
--   • `generation_status='complete'` fica gravado antes de os workouts existirem.
--
-- A única primitiva atômica disponível sem adicionar um driver de banco ao
-- projeto é uma chamada de FUNÇÃO: um statement, uma transação. O repo já
-- provou isso uma vez — `shift_pending_workouts` (20260602) existe exatamente
-- por esse motivo.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- ELA É BURRA DE PROPÓSITO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Esta função NÃO calcula adaptação nenhuma. Não sabe o que é volume, longão,
-- deload ou zona. Ela recebe um patch JÁ DECIDIDO em TypeScript (onde o
-- VolumePlannerService e os testes vivem) e faz só o que apenas ela pode fazer:
--
--   lock · versão · fronteira · compare-and-swap · atomicidade · histórico
--
-- Isso preserva o princípio do roadmap ("número é cálculo determinístico") sem
-- migrar cálculo para SQL, onde ele seria muito mais caro de testar.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- O FORMATO DO PATCH
-- ══════════════════════════════════════════════════════════════════════════════
--
-- [
--   {
--     "workout_id": "uuid",
--     "expected": { "status": "pending", "instructions_md5": "…" },
--     "set":      { "status": "skipped" }
--   }
-- ]
--
-- `expected` é o compare-and-swap POR LINHA. `instructions_md5` vem de
-- `plan_editable_workouts` (o Postgres normaliza jsonb; um md5 calculado no
-- Node divergiria em silêncio) e é OBRIGATÓRIO sempre que `set` toca
-- `instructions_json`.
--
-- ── WHITELIST RÍGIDA: QUATRO COLUNAS ──────────────────────────────────────────
--
--   status · scheduled_date · distance_km · instructions_json
--
-- A função lê exclusivamente essas chaves de `set`. Um patch que tente
-- `plan_id`, `user_id` ou `completed_at` é ignorado por construção. Isso não é
-- zelo excessivo: a função roda como service role, que ignora RLS, e um `UPDATE
-- ... SET` dinâmico sobre jsonb livre seria uma porta para escrever qualquer
-- coisa em qualquer linha.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- DUAS CAMADAS DE CONCORRÊNCIA OTIMISTA
-- ══════════════════════════════════════════════════════════════════════════════
--
--   AGREGADO (digest)  "o mundo que o corredor viu na preview ainda existe?"
--                      Falha ANTES de qualquer escrita, com resposta limpa que
--                      a UI traduz em "o plano mudou, confira de novo".
--
--   LINHA (expected)   "ninguém se meteu entre o meu cálculo e a minha escrita?"
--                      Fecha a corrida fina F3×F6 sobre o mesmo
--                      `instructions_json`, que o digest não pega porque a F3
--                      escreve dentro da própria janela de execução.
--
-- A primeira é a experiência; a segunda é a integridade.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- TUDO OU NADA
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Se qualquer linha do patch não casar, a função levanta `RE409` e o bloco
-- inteiro é desfeito — nenhum workout alterado, nenhum briefing apagado,
-- nenhuma linha em `plan_adaptations`. "Aplicou 6 de 8" deixa de ser um estado
-- possível: a reauditoria (D14) mostrou que estado parcial não é auditável nem
-- reversível, especialmente quando a resposta HTTP se perde.

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
  -- Opcionais, e explicitamente nomeados, para a Fase 3 poder ser atômica de
  -- ponta a ponta. Ver a seção "POR QUE A FASE 3 ENTRA AQUI", no fim.
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

  -- Patch vazio SEM escrita de plano é no-op: a fronteira pode ter comido tudo
  -- (ex.: a "próxima semana" começa hoje). O serviço traduz em "nada a
  -- aplicar", com a lista do que ficou de fora.
  --
  -- Patch vazio COM `p_vdot_history` é legítimo e precisa passar: a Fase 3 pode
  -- concluir uma reestimativa num plano cujo futuro já acabou (nada a
  -- reprecificar), e ainda assim a linha de histórico TEM que ser gravada — é
  -- `evidence.workout_ids` que impede os mesmos treinos de votarem de novo na
  -- semana seguinte.
  IF jsonb_array_length(p_patch) = 0
     AND p_vdot_history IS NULL
     AND p_plan_patch IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'empty_patch');
  END IF;

  -- ── 1. LOCK + PROPRIEDADE + PLANO ATIVO, num passo ─────────────────────────
  --
  -- `FOR UPDATE` serializa duas adaptações concorrentes no mesmo plano: a
  -- segunda espera a primeira commitar e então enxerga o digest novo — e é
  -- rejeitada limpa em vez de escrever sobre estado velho.
  --
  -- `user_id` no WHERE não é redundância: o backend usa a SERVICE ROLE, que
  -- ignora RLS por completo. A propriedade precisa ser garantida aqui.
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
    -- Editar durante a materialização significaria não saber qual snapshot se
    -- está editando.
    RETURN jsonb_build_object('applied', false, 'reason', 'plan_generating');
  END IF;

  -- ── 2. IDEMPOTÊNCIA — antes de qualquer escrita ────────────────────────────
  --
  -- Depois do lock de propósito: duas requisições concorrentes com a mesma
  -- chave chegam aqui em fila, e a segunda vê a linha que a primeira gravou.
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
  --
  -- Subtransação: qualquer `RE409` aqui dentro desfaz TODAS as escritas do
  -- bloco e devolve resposta limpa, sem derrubar a transação do chamador.
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
        -- `expected.status` é obrigatório SEMPRE: é o CAS mínimo, o que
        -- garante que o treino não foi concluído entre o cálculo e a escrita.
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

      -- Status permitidos. `completed` fica de FORA: só o caminho real de
      -- conclusão (que grava distância, tempo, atividade e dispara XP/feedback)
      -- pode marcar um treino como feito. Uma adaptação que pudesse fazê-lo
      -- criaria treino "concluído" sem execução nenhuma.
      v_new_status := v_set->>'status';
      IF v_new_status IS NOT NULL
         AND v_new_status NOT IN ('pending', 'skipped', 'missed') THEN
        RAISE EXCEPTION 'status "%" não é aplicável por adaptação', v_new_status;
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
         -- ── A FRONTEIRA, REAFIRMADA NO SQL ─────────────────────────────────
         -- Duplicação deliberada do helper `isEditableWorkout` do TypeScript.
         -- Foi a AUSÊNCIA desta segunda camada que deixou
         -- `shift_pending_workouts` divergir do serviço sem ninguém notar.
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
        -- Pode ser: alguém concluiu o treino, a F3 reprecificou, a data mudou,
        -- é dia de prova, ou o id não pertence a este plano/usuário. Todas
        -- levam ao mesmo lugar — desfazer tudo e pedir reconfirmação.
        RAISE EXCEPTION 'row_conflict:%', v_wid USING ERRCODE = 'RE409';
      END IF;

      v_workout_ids := v_workout_ids || v_wid;
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
                     'workout_id', v_wid,
                     'before',     v_before,
                     'after',      v_after));
    END LOOP;

    -- ── Artefatos derivados ──────────────────────────────────────────────────
    --
    -- `workout_briefings` tem `workout_id UNIQUE` e é gerado UMA vez. Sem
    -- apagar, a voz do treinador continuaria descrevendo o treino ANTIGO ao
    -- lado do card já atualizado. O texto regenera sob demanda na próxima
    -- abertura.
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
      -- Só o conflito de linha cai aqui. Um bug real (cast inválido, coluna
      -- inexistente) tem outro SQLSTATE e continua propagando — silenciar tudo
      -- com `WHEN OTHERS` transformaria defeito em "conflito" e esconderia o
      -- problema justamente na função mais crítica do sistema.
      RETURN jsonb_build_object(
        'applied',        false,
        'reason',         'row_conflict',
        'detail',         SQLERRM,
        'current_digest', public.plan_state_digest(p_plan_id, p_today));

    WHEN unique_violation THEN
      -- Dois dispositivos, mesmo estado, mesma chave: ambos passaram pelo
      -- digest, mas só um vence o INSERT. O perdedor NÃO é erro — é replay.
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
  'A operação atômica da Fase 6: lock do plano, compare-and-swap por digest e por linha, aplicação do patch (whitelist de 4 colunas), invalidação de briefings e histórico — tudo numa transação. Não calcula nada: recebe um patch já decidido em TypeScript. Conflito é RETORNO, não exceção; falha parcial é impossível por construção.';

-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE A FASE 3 ENTRA AQUI (p_plan_patch / p_vdot_history)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A Fase 3 é a OUTRA escritora de `instructions_json`. Ela lê o array, troca os
-- paces e regrava — linha a linha, sem CAS. Quando a 6.3 passar a reescrever o
-- mesmo array para ajustar volume, uma pode apagar a escrita da outra com HTTP
-- 200 dos dois lados: JSON bem formado, e só o pace OU só o volume novo.
--
-- Fazer a F3 passar por esta mesma função resolve isso sem inventar protocolo
-- de lock nenhum — as duas disputam o `FOR UPDATE` do plano, e a primitiva
-- vira o protocolo.
--
-- `vdot_current` e a linha de `plan_vdot_history` precisam entrar na MESMA
-- transação que a reprecificação. Se os paces mudassem e o histórico falhasse,
-- o dedupe `evidence.workout_ids` sumiria e os mesmos treinos poderiam votar de
-- novo — exatamente a montanha-russa que a Fase 3 foi desenhada para impedir.
--
-- É por isso que estes dois parâmetros existem numa função que, fora eles, é
-- genérica. Eles não relaxam nenhuma guarda: são escrita adicional dentro da
-- mesma fronteira, com whitelist explícita.

-- ── Server-only ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.apply_plan_adaptation(uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_plan_adaptation(uuid, uuid, date, text, text, text, jsonb, boolean, jsonb, jsonb, jsonb) TO service_role;
