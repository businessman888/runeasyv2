-- Fase 6.1 — a re-âncora passa a deslocar EXATAMENTE o que o serviço escolheu.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- O DEFEITO (mina 2 da reauditoria)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- `reanchorRemainingWorkoutsToToday` calcula em memória um conjunto FINO de
-- treinos "restantes": depois da fronteira de progresso (último dia
-- completed/skipped), com regras para `missed` e para o `reclaimFromDate` de
-- "repetir semana". E então chamava:
--
--     UPDATE public.workouts
--        SET scheduled_date = scheduled_date + p_days
--      WHERE plan_id = p_plan_id
--        AND status = 'pending';        ← TODOS os pendentes do plano
--
-- A RPC não recebia os IDs nem reproduzia a fronteira: um pendente ANTERIOR à
-- fronteira — que o serviço tinha deliberadamente excluído — era deslocado do
-- mesmo jeito. As duas seleções nunca foram iguais.
--
-- E 95 testes verdes não pegaram isso porque eles MOCKAM o `.rpc()`
-- (`mockResolvedValue({ data: 0 })`): o predicado SQL nunca executou em teste
-- nenhum. A correção de fundo não é escrever um predicado melhor aqui — é o SQL
-- deixar de ter predicado próprio.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE UMA FUNÇÃO SEPARADA DE `apply_plan_adaptation`
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Existem DUAS fronteiras legítimas neste produto, e unificá-las quebraria uma:
--
--   FRONTEIRA DE EDIÇÃO (apply_plan_adaptation)  amanhã em diante, pending.
--       O que a F6 e a F3 podem MUDAR. Nunca desabilitável.
--
--   FRONTEIRA DE PROGRESSO (esta função)         até onde o atleta já andou.
--       A re-âncora PRECISA tocar o passado: reclamar sessões marcadas `missed`
--       durante a lapsa, e trazer de volta a terça perdida quando a pessoa
--       repete uma semana em que treinou na quarta.
--
-- Um parâmetro booleano que desligasse a janela de edição na função genérica
-- seria justamente o tipo de atalho que reintroduz a mina 5. Duas funções, dois
-- contratos explícitos. A segurança desta vem dos IDs virem do serviço e do
-- escopo `user_id` + `plan_id`.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- O QUE ELA GANHA ALÉM DA CORREÇÃO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Hoje `applyScheduleAdjustment` (Fase 2B) faz: lê `adjustment_applied_at`,
-- executa o shift, e SÓ DEPOIS carimba. Duas requisições concorrentes leem
-- `null` e deslocam o plano duas semanas (D2 da reauditoria); e se o shift
-- confirma e o carimbo falha, um retry legítimo reaplica.
--
-- Aqui reclaim + shift + carimbo + histórico acontecem na MESMA transação, e a
-- idempotência é a `UNIQUE (idempotency_key)` — uma constraint, não uma leitura.

CREATE OR REPLACE FUNCTION public.apply_schedule_shift(
  p_user_id         uuid,
  p_plan_id         uuid,
  p_workout_ids     uuid[],
  p_days            integer,
  p_today           date,
  p_expected_digest text,
  p_idempotency_key text,
  p_insight_id      uuid  DEFAULT NULL,
  p_meta            jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_plan           record;
  v_existing       record;
  v_current_digest text;
  v_digest_after   text;
  v_expected       integer;
  v_reclaimed      integer := 0;
  v_shifted        integer := 0;
  v_changes        jsonb;
  v_adaptation_id  uuid;
BEGIN
  IF p_workout_ids IS NULL OR array_length(p_workout_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'empty_patch', 'shifted', 0);
  END IF;

  IF p_days IS NULL OR p_days = 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'nothing_to_shift', 'shifted', 0);
  END IF;

  v_expected := array_length(p_workout_ids, 1);

  -- ── 1. LOCK + propriedade + plano ativo ────────────────────────────────────
  SELECT id, status INTO v_plan
    FROM public.training_plans
   WHERE id = p_plan_id
     AND user_id = p_user_id
     AND status = 'active'
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'plan_not_editable', 'shifted', 0);
  END IF;

  -- ── 2. IDEMPOTÊNCIA ────────────────────────────────────────────────────────
  SELECT id, digest_after, workout_ids INTO v_existing
    FROM public.plan_adaptations
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'applied', true, 'replayed', true,
      'adaptation_id', v_existing.id,
      'digest_after',  v_existing.digest_after,
      'shifted',       coalesce(array_length(v_existing.workout_ids, 1), 0));
  END IF;

  -- ── 3. DIGEST ──────────────────────────────────────────────────────────────
  --
  -- O digest cobre a janela EDITÁVEL, e o conjunto desta função é mais amplo
  -- (inclui passado/hoje). Ele continua valendo como "o futuro mudou"; o que
  -- protege o restante é a conferência de contagem do passo 4, que é exata.
  v_current_digest := public.plan_state_digest(p_plan_id, p_today);
  IF v_current_digest IS DISTINCT FROM p_expected_digest THEN
    RETURN jsonb_build_object(
      'applied', false, 'reason', 'revision_conflict',
      'current_digest', v_current_digest, 'shifted', 0);
  END IF;

  BEGIN
    -- ── 4a. Reclama os `missed` do conjunto ──────────────────────────────────
    -- Marcados durante a lapsa; voltam a `pending` para o shift movê-los.
    UPDATE public.workouts
       SET status = 'pending'
     WHERE id = ANY(p_workout_ids)
       AND plan_id = p_plan_id
       AND user_id = p_user_id
       AND status = 'missed';
    GET DIAGNOSTICS v_reclaimed = ROW_COUNT;

    -- ── 4b. Desloca EXATAMENTE os IDs recebidos ──────────────────────────────
    --
    -- Sem predicado próprio: a seleção é a lista que o serviço calculou. É esta
    -- linha que desarma a mina 2.
    WITH shifted AS (
      UPDATE public.workouts w
         SET scheduled_date = w.scheduled_date + p_days
       WHERE w.id = ANY(p_workout_ids)
         AND w.plan_id = p_plan_id
         AND w.user_id = p_user_id
         AND w.status = 'pending'
      RETURNING w.id, w.scheduled_date
    )
    SELECT count(*)::integer,
           coalesce(jsonb_agg(jsonb_build_object(
             'workout_id', s.id,
             'before', jsonb_build_object('scheduled_date', s.scheduled_date - p_days),
             'after',  jsonb_build_object('scheduled_date', s.scheduled_date))), '[]'::jsonb)
      INTO v_shifted, v_changes
      FROM shifted s;

    IF v_shifted <> v_expected THEN
      -- Alguém concluiu ou pulou um treino do conjunto entre o cálculo do
      -- serviço e este UPDATE. Deslocar só parte deixaria o calendário com um
      -- buraco silencioso.
      RAISE EXCEPTION 'row_conflict: % de % deslocados', v_shifted, v_expected
        USING ERRCODE = 'RE409';
    END IF;

    -- ── 4c. Carimba o insight, na MESMA transação ────────────────────────────
    IF p_insight_id IS NOT NULL THEN
      UPDATE public.plan_week_insights
         SET adjustment_applied_at = now()
       WHERE id = p_insight_id
         AND user_id = p_user_id;
    END IF;

    UPDATE public.training_plans
       SET last_adaptation_at = now()
     WHERE id = p_plan_id;

    v_digest_after := public.plan_state_digest(p_plan_id, p_today);

    INSERT INTO public.plan_adaptations
      (user_id, plan_id, source, source_insight_id, kind, reason, reason_code,
       metrics, digest_before, digest_after, applied_today, week_number,
       window_start, window_end, workout_ids, changes, briefings_invalidated,
       idempotency_key)
    VALUES
      (p_user_id, p_plan_id,
       coalesce(p_meta->>'source', 'manual'),
       p_insight_id,
       'schedule_shift',
       p_meta->>'reason',
       p_meta->>'reason_code',
       coalesce(p_meta->'metrics', '{}'::jsonb)
         || jsonb_build_object('delta_days', p_days, 'reclaimed', v_reclaimed),
       p_expected_digest,
       v_digest_after,
       p_today,
       (p_meta->>'week_number')::integer,
       (p_meta->>'window_start')::date,
       (p_meta->>'window_end')::date,
       p_workout_ids,
       v_changes,
       0,
       p_idempotency_key)
    RETURNING id INTO v_adaptation_id;

  EXCEPTION
    WHEN sqlstate 'RE409' THEN
      RETURN jsonb_build_object(
        'applied', false, 'reason', 'row_conflict', 'detail', SQLERRM,
        'shifted', 0, 'current_digest', public.plan_state_digest(p_plan_id, p_today));

    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'applied', true, 'replayed', true, 'reason', 'concurrent_replay', 'shifted', 0);
  END;

  RETURN jsonb_build_object(
    'applied',       true,
    'replayed',      false,
    'adaptation_id', v_adaptation_id,
    'digest_after',  v_digest_after,
    'shifted',       v_shifted,
    'reclaimed',     v_reclaimed,
    'delta_days',    p_days);
END;
$$;

COMMENT ON FUNCTION public.apply_schedule_shift(uuid, uuid, uuid[], integer, date, text, text, uuid, jsonb) IS
  'Re-âncora atômica: reclama os `missed` do conjunto, desloca EXATAMENTE os IDs que o serviço selecionou, carimba o insight e grava o histórico — tudo numa transação. Substitui `shift_pending_workouts`, cujo predicado próprio (todos os pendentes do plano) divergia da fronteira calculada pelo serviço.';

-- ── Server-only ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.apply_schedule_shift(uuid, uuid, uuid[], integer, date, text, text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_schedule_shift(uuid, uuid, uuid[], integer, date, text, text, uuid, jsonb) TO service_role;

-- ── A antiga sai ──────────────────────────────────────────────────────────────
--
-- Há UM único call site em todo o backend (`training.service.ts`), migrado
-- nesta mesma fase. Manter as duas conviveria com a versão insegura disponível
-- para o próximo desenvolvedor que precisar deslocar um plano.
--
-- ⚠️ ORDEM DE DEPLOY: esta migration e o código que chama a função nova sobem
-- JUNTOS. Com a função dropada e o código antigo no ar, a re-âncora quebra.
DROP FUNCTION IF EXISTS public.shift_pending_workouts(uuid, integer);
