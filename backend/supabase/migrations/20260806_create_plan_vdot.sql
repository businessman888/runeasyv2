-- Fase 3 — o VDOT vira ENTIDADE PERSISTIDA.
--
-- ── O QUE MUDA ────────────────────────────────────────────────────────────────
--
-- Até aqui o VDOT era uma variável local: `TrainingAIService.resolveVDOT` o
-- calculava a partir do onboarding, injetava os paces nos segmentos e o
-- descartava. Não havia como saber qual VDOT gerou um plano, nem como mudá-lo.
--
-- ── POR QUE COLUNA *E* TABELA ─────────────────────────────────────────────────
--
-- `training_plans.vdot_current` é o valor VIGENTE — o que a reaplicação de paces
-- lê e o que a próxima reestimativa compara. Fica na linha do plano porque é um
-- atributo do plano, e porque toda leitura já carrega essa linha.
--
-- `plan_vdot_history` é a SÉRIE TEMPORAL: uma linha por estimativa, com a
-- evidência que a produziu. Serve a três coisas que a coluna sozinha não faz:
--   1. auditar POR QUE o plano mudou de pace (o usuário vai perguntar);
--   2. impedir que o mesmo treino vote duas vezes (`evidence.workout_ids`);
--   3. alimentar o gráfico de evolução de VDOT sem backfill nenhum.
--
-- ── ADITIVA ───────────────────────────────────────────────────────────────────
--
-- Nada existente muda de comportamento. `vdot_current` NULL significa "plano
-- gerado antes desta fase" (ou walk/run, que não tem pace prescrito) — e a
-- reestimativa simplesmente não roda nesses planos, em vez de chutar um valor.

-- ── 1. O valor vigente ───────────────────────────────────────────────────────

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS vdot_current numeric(4,1);

COMMENT ON COLUMN public.training_plans.vdot_current IS
  'VDOT vigente do plano (27,0–70,0 — os extremos da tabela de Daniels em vdot-table.ts). Semeado na geração com o resolveVDOT do onboarding e atualizado pela reestimativa no fecho de semana. NULL = plano anterior à Fase 3, ou walk/run (sem pace prescrito): a reestimativa NÃO roda nesses casos.';

-- ── 2. A série temporal ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_vdot_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
  plan_id    uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,

  -- NULL no semeio (não havia valor anterior).
  vdot_before numeric(4,1),
  vdot_after  numeric(4,1) NOT NULL,

  -- 'seed'       — semeado na criação do plano, a partir do onboarding
  -- 'reestimate' — movido pela evidência de execução, no fecho de semana
  source text NOT NULL CHECK (source IN ('seed', 'reestimate')),

  -- Frase determinística ("3 treinos de qualidade 18 s/km acima da faixa").
  -- A IA NÃO escreve isto: ela só narra o que já foi decidido.
  reason text,

  -- Semana do plano em que a reestimativa rodou (NULL no semeio).
  week_number integer,

  -- Quantos treinos de qualidade sustentaram a decisão.
  sample_size integer,

  -- Média (s/km) da distância até a FAIXA prescrita. Negativo = mais rápido.
  avg_delta_seconds integer,

  -- { workout_ids: uuid[], efforts: [{ workout_id, date, zones, pace_seconds,
  --   prescribed_min, prescribed_max, delta_seconds, implied_vdot }] }
  --
  -- `workout_ids` é o que impede a montanha-russa: um treino que já votou não
  -- vota de novo, então a mesma evidência nunca move o VDOT duas vezes.
  evidence jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- A consulta quente: "o histórico deste plano, mais recente primeiro" (para
-- descobrir quais treinos já votaram, e para o gráfico de evolução).
CREATE INDEX IF NOT EXISTS plan_vdot_history_plan_created_idx
  ON public.plan_vdot_history (plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS plan_vdot_history_user_created_idx
  ON public.plan_vdot_history (user_id, created_at DESC);

-- Padrão deste repo: RLS LIGADA com ZERO POLÍTICAS. Bloqueia a tabela por
-- completo no Data API (anon/authenticated não leem nada) e deixa o acesso só
-- para o backend, que usa a service role e ignora RLS. Idêntico a
-- workouts / training_plans / plan_retrospectives / plan_week_insights.
ALTER TABLE public.plan_vdot_history ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.plan_vdot_history IS
  'Série temporal do VDOT: uma linha por estimativa, com a evidência determinística que a produziu. A decisão NUNCA é da IA — ela só dá voz ao número já decidido.';

COMMENT ON COLUMN public.plan_vdot_history.evidence IS
  'Treinos de qualidade que sustentaram a decisão. evidence->>workout_ids é consultado antes de cada reestimativa: um treino vota UMA vez só, e é isso que impede o mesmo bom desempenho de empurrar o VDOT repetidamente.';
