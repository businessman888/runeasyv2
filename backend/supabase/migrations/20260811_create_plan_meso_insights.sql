-- Fase 4 — insight de MESOCICLO (bloco de 4 semanas do plano).
--
-- ── A ALTITUDE QUE FALTAVA ────────────────────────────────────────────────────
--
-- `plan_week_insights` é a foto de UMA semana; `plan_retrospectives` é o ciclo
-- inteiro. Entre os dois não havia nada — um plano de 12 semanas produzia 11
-- fotos e 1 fechamento, e nenhuma linha descrevia o ARCO de um bloco de treino.
--
-- ── POR QUE 4 SEMANAS, E NÃO "UMA FASE" ───────────────────────────────────────
--
-- `DELOAD_EVERY_N_WEEKS = 4` (volume-planner.constants.ts) já implementa o
-- mesociclo clássico: 3 semanas de carga + 1 de descarga, com o vale de deload
-- caindo em S4 e S8. A fase (base/build/peak/taper) foi descartada como
-- FRONTEIRA porque é desigual demais — num plano de 12 semanas ela produz
-- blocos de 6, 3, 2 e 1 semana, e um "mesociclo" de 1 semana é o insight
-- semanal com outro nome. A fase entra como RÓTULO (`dominant_phase`), que é
-- onde ela é boa: dá vocabulário ("Bloco 2 · desenvolvimento").
--
-- ── O ÚLTIMO BLOCO NÃO EXISTE ─────────────────────────────────────────────────
--
-- O bloco final termina junto com o plano, na mesma madrugada da retrospectiva,
-- que é o fechamento de altitude máxima. Ele é suprimido — análogo exato do que
-- a Fase 2A já faz com a última SEMANA. Num plano de 12 semanas, portanto, só
-- os blocos 1 (S1-4) e 2 (S5-8) geram linha aqui.
--
-- ── REFLEXÃO, SEM AÇÃO ────────────────────────────────────────────────────────
--
-- Não há `suggested_adjustment` nem `adjustment_applied_at`, e é deliberado: o
-- espaço de ação já está ocupado. Calendário é ação do insight SEMANAL
-- (aplicável, com trava de idempotência); pace é automático desde a Fase 3
-- (reestimativa de VDOT); volume/prescrição é explicitamente Fase 6. Uma ação
-- nova nesta altitude anteciparia a Fase 6 com outro nome e diluiria o único
-- canal que hoje pede um toque ao usuário.

CREATE TABLE IF NOT EXISTS public.plan_meso_insights (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,

  -- ── Identidade do bloco ─────────────────────────────────────────────────────
  -- `ceil(week_number / 4)`. Derivado de `week_number` puro, sem depender de
  -- `plan_json` — o que também o imuniza contra a fase gravada, que até
  -- 2026-08-11 era eco da IA e não cálculo.
  block_index integer NOT NULL,
  week_start  integer NOT NULL,  -- primeira semana DO PLANO no bloco
  week_end    integer NOT NULL,  -- última semana DO PLANO no bloco

  -- Janela EFETIVA em datas: MIN/MAX(workouts.scheduled_date) das semanas do
  -- bloco. Mesma escolha de `plan_week_insights.week_start/week_end`, e pelo
  -- mesmo motivo: é a única fronteira que `shift_pending_workouts` não
  -- dessincroniza, porque é derivada exatamente da coluna que ela move.
  block_start date NOT NULL,
  block_end   date NOT NULL,

  -- Fase DOMINANTE do bloco (moda; empate resolvido pela fase da última semana,
  -- que é onde o atleta chega). Recomputada de `calculatePhases`, nunca lida do
  -- `plan_json`.
  dominant_phase text NOT NULL
    CHECK (dominant_phase IN ('base', 'build', 'peak', 'taper')),

  -- ── Aderência ao plano (escopo: workouts.plan_id AND week_number no bloco) ──
  -- Os percentuais são recomputados das SOMAS do bloco. Nunca a média dos
  -- percentuais semanais: as semanas do bloco têm tamanhos muito diferentes
  -- (o deload corta 25% do volume), e a média das razões não é a razão das
  -- somas.
  planned_workouts         integer,
  completed_workouts       integer,
  completion_rate          numeric(7,2),
  planned_distance_km      numeric(10,2),
  completed_distance_km    numeric(10,2),
  distance_vs_goal_percent numeric(7,2),
  execution_ratio_percent  numeric(7,2),
  avg_pace_seconds         integer,
  expected_pace_seconds    integer,

  -- ── Frequência: DIAS DISTINTOS com treino do plano concluído ────────────────
  frequency_actual_days integer,
  frequency_target_days numeric(4,2),

  -- ── Total corrido na janela (INCLUI corrida livre) ──────────────────────────
  total_distance_km    numeric(10,2),
  total_runs_in_period integer,
  free_run_distance_km numeric(10,2),

  -- ── Blocos estruturados (payload de exibição, não critério de query) ────────

  -- [{ week_number, planned_km, completed_km }] — uma entrada por semana.
  -- É O DADO QUE DEFINE A FASE: a tendência ao longo do bloco é exatamente o
  -- que o insight semanal, por construção, não tem como produzir.
  volume_trend jsonb,

  zone_distribution   jsonb,
  intensity_adherence jsonb,

  -- Pace REAL dos tiros do bloco, com o alvo da zona ao lado
  -- (VdotService.describeQualityEfforts — a mesma medição que decide o VDOT).
  quality_efforts jsonb,

  -- Movimento de VDOT dentro do bloco, ou NULL. NULL é o caso COMUM, não uma
  -- falha: slots de qualidade só existem em build/peak, um por semana, e com
  -- MIN_QUALITY_EFFORTS=3 um plano de 12 semanas move o VDOT no máximo uma vez
  -- — no fecho da semana 9, que cai no bloco 3, que é suprimido. Por isso o
  -- VDOT é DESTAQUE OCASIONAL e não o eixo do insight: o eixo é
  -- volume_trend + quality_efforts.
  vdot_highlight jsonb,

  ai_narrative text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  notified_at  timestamptz,
  seen_at      timestamptz,

  -- A dedupe do gatilho. O cron varre planos ativos todo dia e gera para cada
  -- bloco FECHADO que ainda não tem insight; a checagem é "existe linha?" e esta
  -- constraint é a rede final — nunca um Set em memória (que perde estado em
  -- restart e não protege contra múltiplas réplicas).
  CONSTRAINT plan_meso_insights_plan_block_key UNIQUE (plan_id, block_index)
);

-- Consulta do app: "meu bloco mais recente".
CREATE INDEX IF NOT EXISTS plan_meso_insights_user_block_idx
  ON public.plan_meso_insights (user_id, block_end DESC);

-- O carrossel pergunta "existe insight completed não visto?" a cada abertura do
-- app. Índice parcial: só as linhas não vistas entram, o que o mantém minúsculo.
CREATE INDEX IF NOT EXISTS plan_meso_insights_unseen_idx
  ON public.plan_meso_insights (user_id, block_end DESC)
  WHERE seen_at IS NULL AND status = 'completed';

-- Padrão deste repo: RLS LIGADA com ZERO POLÍTICAS. Isso bloqueia a tabela por
-- completo no Data API (anon/authenticated não leem nada) e deixa o acesso só
-- para o backend, que usa a service role e ignora RLS. Idêntico a
-- workouts / training_plans / plan_week_insights / plan_vdot_history.
ALTER TABLE public.plan_meso_insights ENABLE ROW LEVEL SECURITY;

-- ── Comentários nos campos que mais geram confusão ───────────────────────────

COMMENT ON TABLE public.plan_meso_insights IS
  'Um insight por BLOCO DE 4 SEMANAS do plano (block_index = ceil(week_number/4)), gerado no fecho do bloco pelo mesmo cron do insight semanal. O ÚLTIMO bloco é suprimido: a retrospectiva de fim de ciclo o cobre. É reflexão pura — não carrega ação nem ajuste.';

COMMENT ON COLUMN public.plan_meso_insights.block_index IS
  'ceil(week_number / 4). O último bloco de um plano NUNCA tem linha aqui (suprimido em favor da retrospectiva), então um plano de 12 semanas gera os blocos 1 e 2, e um plano de até 4 semanas não gera nenhum.';

COMMENT ON COLUMN public.plan_meso_insights.dominant_phase IS
  'Fase que mais aparece nas semanas do bloco; empate resolvido pela fase da ÚLTIMA semana (é onde o atleta chega). Recomputada de VolumePlannerService.calculatePhases(duration_weeks, goalKm) — NUNCA lida de plan_json, cuja fase foi eco da IA até 2026-08-11.';

COMMENT ON COLUMN public.plan_meso_insights.completion_rate IS
  'Recomputado da SOMA do bloco (Σ concluídos ÷ Σ planejados), não a média dos completion_rate semanais. As semanas do bloco têm tamanhos diferentes — o deload corta 25% do volume — e a média das razões não é a razão das somas.';

COMMENT ON COLUMN public.plan_meso_insights.total_distance_km IS
  'Total corrido na janela do bloco — INCLUI corrida livre e treino manual. NÃO é aderência. NUNCA somar com completed_distance_km: são escopos diferentes e o resultado contaria a mesma corrida duas vezes.';

COMMENT ON COLUMN public.plan_meso_insights.volume_trend IS
  'O ARCO do bloco: [{ week_number, planned_km, completed_km }], uma entrada por semana. É o dado que distingue esta fase do insight semanal, que por construção só enxerga uma semana.';

COMMENT ON COLUMN public.plan_meso_insights.vdot_highlight IS
  'Movimento de VDOT dentro do bloco, ou NULL. NULL é o caso COMUM e não indica falha: a cadência real permite ~1 movimento por plano, no fecho da semana 9, que cai no bloco suprimido. Quando NULL, o insight conta a execução de qualidade (quality_efforts) — nunca fabrica evolução.';

COMMENT ON COLUMN public.plan_meso_insights.notified_at IS
  'Quando o push foi enviado. Na madrugada em que um bloco fecha, é o MESO que notifica e o insight semanal daquela semana fica com notified_at NULL — um push por madrugada, e a altitude maior ganha a voz. Se a geração do meso falhar, o semanal volta a notificar.';

COMMENT ON COLUMN public.plan_meso_insights.seen_at IS
  'Quando o usuário viu este card no carrossel de insights. Cada card carimba o seu ao entrar em foco. NULL = ainda não visto.';
