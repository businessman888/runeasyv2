-- Fase 6.1 — o LOG das adaptações de plano ativo.
--
-- ── POR QUE UMA TABELA NOVA ───────────────────────────────────────────────────
--
-- `training_plans.adaptation_history jsonb` e `last_adaptation_at` existem no
-- schema desde sempre e nunca foram lidos nem escritos por uma linha sequer do
-- backend. Ressuscitar aquele array seria pior que criar esta tabela:
--
--   • um campo JSON não tem UNIQUE — e a idempotência do apply PRECISA de uma
--     constraint, senão dois toques concorrentes aplicam duas vezes;
--   • não indexa por período (suporte pergunta "o que mudou naquela semana?");
--   • cresce sem limite na linha mais lida do plano;
--   • não suporta FK para o insight que originou a adaptação.
--
-- `adaptation_history` permanece MORTA de propósito. Este comentário existe para
-- ninguém a ressuscitar por engano achando que é o lugar certo.
-- `last_adaptation_at`, essa sim, passa a ser escrita pelas funções desta fase —
-- é um "houve adaptação" barato, sem migration.
--
-- ── MOLDE ─────────────────────────────────────────────────────────────────────
--
-- Espelha `plan_vdot_history` (20260806): série temporal, FKs com CASCADE, CHECK
-- nos enums, evidência em jsonb, RLS ligada com ZERO políticas (o backend usa
-- service role e ignora RLS; anon/authenticated não leem nada).
--
-- ── O QUE ESTA TABELA TEM QUE RESPONDER ───────────────────────────────────────
--
-- Nenhuma destas perguntas tem resposta hoje:
--   "por que meu treino de quinta mudou?"      → reason + metrics + source_insight_id
--   "o que exatamente mudou?"                  → changes (antes/depois por treino)
--   "sobre qual estado isso foi decidido?"     → digest_before
--   "foi aplicado uma vez ou duas?"            → idempotency_key UNIQUE + applied_at
--   "quem mexeu por último neste treino?"      → workout_ids + source

CREATE TABLE IF NOT EXISTS public.plan_adaptations (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,

  -- ── De onde veio ────────────────────────────────────────────────────────────
  -- 'weekly_insight'   — o corredor tocou "aplicar" numa sugestão da Fase 2
  -- 'vdot_reestimate'  — a Fase 3 reprecificou paces no fecho de semana
  -- 'reactivation'     — re-âncora disparada pelo webhook do RevenueCat
  -- 'manual'           — rota administrativa/QA
  source text NOT NULL
    CHECK (source IN ('weekly_insight', 'vdot_reestimate', 'reactivation', 'manual')),

  -- NULL quando a adaptação não nasceu de um insight (webhook, QA).
  source_insight_id uuid REFERENCES public.plan_week_insights(id) ON DELETE SET NULL,

  -- O QUE foi feito. Espelha os códigos do `weekly-adjustment.ts` onde aplicável.
  -- 'reprice' é da Fase 3 (só pace); 'schedule_shift' cobre adiar/repetir semana.
  kind text NOT NULL
    CHECK (kind IN ('reduzir_frequencia', 'reduzir_volume', 'schedule_shift', 'reprice')),

  -- ── Por quê (DETERMINÍSTICO — a IA não escreve isto, ela só narra) ──────────
  reason      text,   -- frase pronta ("3 treinos de qualidade 18 s/km acima da faixa")
  reason_code text,   -- AdjustmentReason: chave estável para UI e teste
  metrics     jsonb,  -- os números que dispararam a regra

  -- ── Sobre qual ESTADO ───────────────────────────────────────────────────────
  -- O digest é md5 do estado da janela editável (ver plan_state_digest). Não é
  -- legível para humano de propósito: quem conversa com o suporte é a ORDEM das
  -- linhas ("3ª adaptação deste plano"); o digest é a prova técnica.
  digest_before text NOT NULL,
  digest_after  text NOT NULL,

  -- O "hoje" de São Paulo que definiu a fronteira. Guardado porque a fronteira
  -- é relativa a ele: sem isto, auditar "por que aquele treino não foi tocado?"
  -- exigiria adivinhar em que dia a adaptação rodou.
  applied_today date NOT NULL,

  -- ── Escopo ──────────────────────────────────────────────────────────────────
  week_number  integer,
  window_start date,
  window_end   date,

  -- ── O que mudou, auditável linha a linha ────────────────────────────────────
  workout_ids uuid[] NOT NULL,
  -- [{ workout_id, before: {...}, after: {...} }] — só as 4 colunas que a
  -- fundação permite escrever: status, scheduled_date, distance_km,
  -- instructions_json.
  changes jsonb NOT NULL,
  briefings_invalidated integer NOT NULL DEFAULT 0,

  -- ── Replay ──────────────────────────────────────────────────────────────────
  -- sha256(plan_id ‖ digest_before ‖ kind ‖ workout_ids ordenados), derivada no
  -- backend. Um replay (timeout com resposta perdida, retry HTTP, segundo
  -- aparelho sobre o mesmo estado) reproduz a MESMA chave e cai no caminho de
  -- dedupe. Uma segunda adaptação legítima parte de um estado diferente, logo
  -- de um digest diferente, logo de uma chave diferente — e passa.
  idempotency_key text NOT NULL UNIQUE,

  applied_at timestamptz NOT NULL DEFAULT now(),

  -- ── Undo ────────────────────────────────────────────────────────────────────
  -- A 6.2 (`reduzir_frequência` → skipped) é declarada "trivialmente reversível"
  -- no roadmap. Sem estas colunas o desfazer viraria um write sem rastro: o
  -- undo é uma adaptação INVERSA que aponta para a original.
  reverted_at    timestamptz,
  reverted_by_id uuid REFERENCES public.plan_adaptations(id) ON DELETE SET NULL
);

-- A consulta quente: "o histórico deste plano, mais recente primeiro".
CREATE INDEX IF NOT EXISTS plan_adaptations_plan_applied_idx
  ON public.plan_adaptations (plan_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS plan_adaptations_user_applied_idx
  ON public.plan_adaptations (user_id, applied_at DESC);

-- Padrão deste repo: RLS LIGADA com ZERO POLÍTICAS. Bloqueia a tabela por
-- completo no Data API e deixa o acesso só para o backend (service role).
-- Idêntico a plan_vdot_history / plan_week_insights / plan_meso_insights.
ALTER TABLE public.plan_adaptations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.plan_adaptations IS
  'Log das adaptações de plano ATIVO (Fase 6). Uma linha por aplicação atômica, com o antes/depois de cada treino tocado e o digest do estado sobre o qual foi decidida. A decisão é sempre determinística — a IA só narra.';

COMMENT ON COLUMN public.plan_adaptations.idempotency_key IS
  'Derivada no backend: sha256(plan_id ‖ digest_before ‖ kind ‖ workout_ids ordenados). É a UNIQUE — e não uma leitura prévia — que impede aplicação dupla: duas requisições concorrentes leriam ambas "ainda não aplicado", mas só uma vence o INSERT.';

COMMENT ON COLUMN public.plan_adaptations.changes IS
  'Antes/depois por treino, restrito às 4 colunas que a fundação permite escrever: status, scheduled_date, distance_km, instructions_json. É o que responde "o que exatamente mudou no meu plano?" sem depender de log de aplicação.';

COMMENT ON COLUMN public.plan_adaptations.applied_today IS
  'O "hoje" de São Paulo usado como fronteira (a edição só alcança amanhã em diante). Guardado porque sem ele não dá para auditar por que um treino específico ficou de fora.';
