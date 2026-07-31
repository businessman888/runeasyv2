-- Fase 1A — retrospectiva escopada por plano.
--
-- ── O DEFEITO ─────────────────────────────────────────────────────────────────
--
-- Até aqui a retrospectiva media "tudo o que o usuário correu" contra "o que o
-- plano pediu": o numerador vinha de uma query em `activities` filtrada só por
-- user_id + janela de datas (retrospective.service.ts), e o denominador só dos
-- `workouts` do plano. Quem corresse por fora inflava a própria aderência —
-- maçã sobre laranja.
--
-- O escopo do plano não pode passar por `activities`: aquela tabela não tem
-- `plan_id`, só `workout_id`. A rota correta é `workouts`, que tem `plan_id` e
-- carrega as colunas de execução (`distance_run`, `time_run_seconds`) gravadas
-- na conclusão. Corrida livre grava `plan_id: null`, então o escopo a exclui
-- por construção.
--
-- Decisão de produto: DOIS números, nunca somados — aderência ao plano e total
-- corrido no período. As colunas abaixo persistem os dois lados, mais a janela
-- efetivamente usada (derivada de MIN/MAX(workouts.scheduled_date), que respeita
-- a re-âncora, ao contrário de created_at + duration_weeks*7).
--
-- ── SEGURANÇA ─────────────────────────────────────────────────────────────────
--
-- `plan_retrospectives` tem 0 linhas em produção — a retrospectiva nunca rodou.
-- Por isso o ALTER COLUMN abaixo é instantâneo (sem rewrite) e a mudança de
-- significado de `distance_vs_goal_percent` (de tudo/planejado para
-- doPlano/planejado) não exige backfill.
--
-- ⚠️ VERIFICAR ANTES DE APLICAR:  select count(*) from plan_retrospectives;
--    Se NÃO for 0, remova o bloco ALTER COLUMN (vira rewrite com lock) e aplique
--    apenas os ADD COLUMN.

ALTER TABLE plan_retrospectives
  ADD COLUMN IF NOT EXISTS total_distance_planned_km   numeric(10,2),
  ADD COLUMN IF NOT EXISTS plan_distance_completed_km  numeric(10,2),
  ADD COLUMN IF NOT EXISTS free_run_distance_km        numeric(10,2),
  ADD COLUMN IF NOT EXISTS total_runs_in_period        integer,
  ADD COLUMN IF NOT EXISTS target_pace_seconds         integer,
  ADD COLUMN IF NOT EXISTS plan_window_start           date,
  ADD COLUMN IF NOT EXISTS plan_window_end             date,
  ADD COLUMN IF NOT EXISTS frequency_actual_per_week   numeric(4,2),
  ADD COLUMN IF NOT EXISTS frequency_target_per_week   numeric(4,2);

-- numeric(5,2) tampa em 999.99, e um valor acima aborta o UPDATE INTEIRO com
-- erro 22003 (numeric field overflow) — a retrospectiva falharia por completo.
-- distance_vs_goal_percent passa disso quando o atleta corre >10x o planejado,
-- cenário real num plano curto de 5k. Alarga para 7,2 (até 99999.99).
ALTER TABLE plan_retrospectives
  ALTER COLUMN distance_vs_goal_percent  TYPE numeric(7,2),
  ALTER COLUMN pace_vs_goal_percent      TYPE numeric(7,2),
  ALTER COLUMN frequency_vs_goal_percent TYPE numeric(7,2),
  ALTER COLUMN completion_rate           TYPE numeric(7,2);

COMMENT ON COLUMN plan_retrospectives.total_distance_km IS
  'Total corrido no período do plano — INCLUI corrida livre e treino manual. NÃO é aderência; para isso use plan_distance_completed_km.';

COMMENT ON COLUMN plan_retrospectives.plan_distance_completed_km IS
  'Km executados DENTRO do plano (workouts.plan_id = plan_id AND status = completed). Numerador de distance_vs_goal_percent.';

COMMENT ON COLUMN plan_retrospectives.total_distance_planned_km IS
  'Soma de workouts.distance_km do plano. Denominador de distance_vs_goal_percent.';

COMMENT ON COLUMN plan_retrospectives.free_run_distance_km IS
  'total_distance_km - plan_distance_completed_km, com piso em 0. Quanto o atleta correu fora do plano.';

COMMENT ON COLUMN plan_retrospectives.frequency_actual_per_week IS
  'Treinos do plano concluídos ÷ semanas da janela. Base de frequency_vs_goal_percent, que até a Fase 1A era uma cópia literal de completion_rate.';

COMMENT ON COLUMN plan_retrospectives.frequency_target_per_week IS
  'Frequência-alvo do ciclo (training_plans.frequency_per_week, com fallback para o onboarding).';

COMMENT ON COLUMN plan_retrospectives.plan_window_end IS
  'MAX(workouts.scheduled_date) do plano. Respeita a re-âncora — ao contrário de created_at + duration_weeks*7, que congela na criação enquanto shift_pending_workouts move os treinos.';

COMMENT ON COLUMN plan_retrospectives.target_pace_seconds IS
  'Pace-alvo médio do plano em segundos/km, derivado de instructions_json. Antes era calculado e descartado — a tela exibia um 5:30 hardcoded.';
