-- Fase 2A — insight semanal por SEMANA DO PLANO.
--
-- ── POR QUE UMA TABELA NOVA ───────────────────────────────────────────────────
--
-- `plan_retrospectives` tem `UNIQUE (plan_id)`: uma linha por plano, por
-- construção. O insight é por SEMANA, então não cabe lá nem em `workouts`
-- (que é por treino). É tabela nova, e a chave é `(plan_id, week_number)`.
--
-- ── A UNIQUE É A DEDUPE DO GATILHO ────────────────────────────────────────────
--
-- O cron varre planos ativos todo dia e gera para cada semana FECHADA que ainda
-- não tem insight. A dedupe é "existe linha?" + esta constraint como rede
-- final — nunca um Set em memória (o cron de lembretes usa um, perde estado em
-- restart e o cleanup dele nem funciona). A constraint também é o que protege
-- contra o backend rodar em mais de uma réplica.
--
-- ── STATUS COM CHECK ──────────────────────────────────────────────────────────
--
-- `plan_retrospectives.status` é varchar(20) SEM CHECK, e por isso os valores
-- 'pending'/'failed' existem no tipo TS e nunca foram gravados. Aqui o CHECK
-- entra desde o início, no molde de `ai_feedbacks.status`.
--
-- Diferença deliberada em relação à retrospectiva: na FALHA a linha fica com
-- `status='failed'` em vez de ser apagada. A retrospectiva apaga porque a
-- checagem dela ignora `status` e uma linha órfã bloquearia o plano para sempre;
-- aqui a UNIQUE já garante unicidade, então persistir a falha é seguro e
-- habilita "tentar novamente".

CREATE TABLE IF NOT EXISTS public.plan_week_insights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
  plan_id      uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  week_number  integer NOT NULL,

  -- Janela EFETIVA da semana: MIN/MAX(workouts.scheduled_date) daquele
  -- week_number. Respeita a re-âncora, porque é derivada exatamente da coluna
  -- que shift_pending_workouts move.
  week_start date NOT NULL,
  week_end   date NOT NULL,

  -- ── Aderência ao plano (escopo: workouts.plan_id = plan_id AND week_number) ──
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
  frequency_actual_days     integer,
  frequency_target_days     numeric(4,2),
  frequency_vs_goal_percent numeric(7,2),

  -- ── Total corrido na janela (INCLUI corrida livre) ──────────────────────────
  total_distance_km    numeric(10,2),
  total_runs_in_period integer,
  free_run_distance_km numeric(10,2),

  -- ── Blocos estruturados (payload de exibição, não critério de query) ────────
  metrics_deltas       jsonb,
  zone_distribution    jsonb,
  intensity_adherence  jsonb,
  suggested_adjustment jsonb,

  ai_narrative text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  notified_at  timestamptz,

  CONSTRAINT plan_week_insights_plan_week_key UNIQUE (plan_id, week_number)
);

-- Consulta do app: "meus insights, mais recente primeiro".
CREATE INDEX IF NOT EXISTS plan_week_insights_user_week_idx
  ON public.plan_week_insights (user_id, week_end DESC);

-- Padrão deste repo: RLS LIGADA com ZERO POLÍTICAS. Isso bloqueia a tabela por
-- completo no Data API (anon/authenticated não leem nada) e deixa o acesso só
-- para o backend, que usa a service role e ignora RLS. Idêntico a
-- workouts / training_plans / notifications / plan_retrospectives / ai_feedbacks.
ALTER TABLE public.plan_week_insights ENABLE ROW LEVEL SECURITY;

-- ── Comentários nos campos que já geraram confusão na Fase 1A ────────────────

COMMENT ON TABLE public.plan_week_insights IS
  'Um insight por SEMANA DO PLANO (week_number), gerado na virada de semana pelo cron. A retrospectiva cobre o fim do ciclo; a última semana do plano é suprimida aqui para não duplicar.';

COMMENT ON COLUMN public.plan_week_insights.week_end IS
  'MAX(workouts.scheduled_date) da semana. Respeita a re-âncora — ao contrário de created_at + (n-1)*7, que congela na criação enquanto shift_pending_workouts move os treinos. Também é o predicado de "semana fechada": week_end < hoje.';

COMMENT ON COLUMN public.plan_week_insights.total_distance_km IS
  'Total corrido na janela da semana — INCLUI corrida livre e treino manual. NÃO é aderência. NUNCA somar com completed_distance_km: são escopos diferentes e o resultado contaria a mesma corrida duas vezes.';

COMMENT ON COLUMN public.plan_week_insights.completed_distance_km IS
  'Km executados DENTRO do plano nesta semana (workouts.plan_id = plan_id AND week_number = N AND status = completed). Numerador de distance_vs_goal_percent.';

COMMENT ON COLUMN public.plan_week_insights.execution_ratio_percent IS
  'Σ distance_run ÷ Σ distance_km SÓ DOS TREINOS CONCLUÍDOS. Diferente de distance_vs_goal_percent, cujo denominador é a semana inteira. É esta coluna que separa "não apareceu" (completion_rate baixo) de "apareceu e não cumpriu" (execution_ratio baixo) — a distinção que decide a classe do reajuste sugerido.';

COMMENT ON COLUMN public.plan_week_insights.frequency_actual_days IS
  'DIAS DISTINTOS com treino do plano concluído — não contagem de treinos. Dois treinos no mesmo dia contam 1. Mesma definição de StatsService.getPeriodSummary.';

COMMENT ON COLUMN public.plan_week_insights.expected_pace_seconds IS
  'Pace esperado da semana em segundos/km, ponderado pela distância dos SEGMENTOS de instructions_json. Ponderado porque pace_seconds_per_km é da corrida inteira (inclui aquecimento e volta à calma); comparar com o pace do segmento main faria todo mundo parecer mais lento do que correu. workouts.target_pace_seconds NÃO serve: é NULL em todo treino de plano (só é preenchida para source=manual).';

COMMENT ON COLUMN public.plan_week_insights.zone_distribution IS
  'Zona PRESCRITA lida de workouts.metadata->>zone (cobertura de 100% nos treinos de plano), não inferida do tipo do treino. Formato: { prescribed: {Z1..Z5}, executed: {Z1..Z5} }.';

COMMENT ON COLUMN public.plan_week_insights.suggested_adjustment IS
  'Reajuste decidido por REGRA DETERMINÍSTICA (nunca pela IA). Formato: { code, class, reason, metrics }. class=schedule é aplicável hoje (data/status, via shift_pending_workouts); class=prescription é só sugestão até a Fase 6, porque mexer em volume/prescrição seria o primeiro write a dessincronizar plan_json de workouts.';

COMMENT ON COLUMN public.plan_week_insights.ai_narrative IS
  'Voz do coach (Haiku). Recebe as métricas e o enum JÁ DECIDIDOS e só narra — não recalcula nem escolhe ajuste. Cai para um template determinístico quando a IA está indisponível; nunca derruba a geração.';

COMMENT ON COLUMN public.plan_week_insights.notified_at IS
  'Quando o push foi enviado. NULL com status=completed significa push SUPRIMIDO de propósito: semana zerada consecutiva (o usuário sumiu). A primeira semana zerada notifica; as seguintes não, para não empurrar push semanal em quem já se desengajou.';
