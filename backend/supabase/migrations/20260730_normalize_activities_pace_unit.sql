-- Fase 0 (Parte B) — normaliza `activities.average_pace` / `max_pace` para a
-- unidade canônica do repo: SEGUNDOS por km.
--
-- ── O BUG ─────────────────────────────────────────────────────────────────────
--
-- `common/pace-calculator/pace-format.ts` declara segundos/km como a unidade
-- única de armazenamento, e `workouts.pace_seconds_per_km`,
-- `workouts.target_pace_seconds` e `instructions_json[].pace_min/max` seguem
-- isso. `activities.average_pace` ficou para trás: os cinco produtores
-- (completeWorkout, a activity sintetizada em getWorkout, os normalizers
-- apple-health e health-connect, e o upsert de wearable em ActivitySyncService)
-- gravavam DECIMAL min/km.
--
-- Do outro lado, `WellnessService.ActivityRow` declarava o campo como
-- "seconds per km" e o consumia como tal — arredondando. Um pace real de
-- 5,8552 min/km virava `Math.round(5.8552)` = 6, e o mobile — cujo
-- `formatPace(seconds)` em PerformanceGrid/EvolutionChart espera segundos —
-- renderizava "0:06/km" na tela Wellness.
--
-- A prova em produção: a MESMA corrida gravou 351,3 em
-- `workouts.pace_seconds_per_km` e 5,8552 em `activities.average_pace`
-- (5,8552 × 60 = 351,3). Mesmo valor, duas unidades, duas tabelas.
--
-- ── O QUE ESTA MIGRATION FAZ ──────────────────────────────────────────────────
--
-- Multiplica por 60 apenas as linhas ainda em decimal min/km. O corte usa o
-- mesmo limiar de `paceValueToSecondsPerKm` (< 20), que não tem zona cinza real:
--   • min/km decimal de corrida humana: ~2,0–15,0   (< 20)
--   • segundos/km de corrida humana:    ~120–900    (>> 20)
--
-- IDEMPOTENTE: rodar duas vezes é no-op, porque depois do primeiro UPDATE
-- nenhuma linha satisfaz mais `< 20`. Seguro para reaplicar.
--
-- O código já tolera as duas formas — todo leitor passa por
-- `paceValueToSecondsPerKm`. Esta migration existe para (a) a ordenação
-- server-side de "melhor pace" em `StatsService.getSummaryStats` comparar
-- valores homogêneos, já que ela ordena no Postgres e não em JS, e (b) o dado
-- em repouso parar de ser ambíguo.
--
-- Em produção (2026-07-30) isto afeta exatamente 2 linhas, ambas de teste.

UPDATE public.activities
   SET average_pace = average_pace * 60
 WHERE average_pace IS NOT NULL
   AND average_pace > 0
   AND average_pace < 20;

UPDATE public.activities
   SET max_pace = max_pace * 60
 WHERE max_pace IS NOT NULL
   AND max_pace > 0
   AND max_pace < 20;

COMMENT ON COLUMN public.activities.average_pace IS
  'Pace médio em SEGUNDOS por km (unidade canônica — ver common/pace-calculator/pace-format.ts). Gravado em decimal min/km antes de 2026-07-30; normalizado por esta migration.';

COMMENT ON COLUMN public.activities.max_pace IS
  'Pace máximo em SEGUNDOS por km (unidade canônica — ver common/pace-calculator/pace-format.ts). Gravado em decimal min/km antes de 2026-07-30; normalizado por esta migration.';
