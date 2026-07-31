-- Fase 1B — maior corrida única do ciclo (o clímax dos stories).
--
-- ── POR QUE UMA COLUNA NOVA ───────────────────────────────────────────────────
--
-- `plan_retrospectives` só guarda AGREGADOS de período (somas, médias, taxas).
-- O card de clímax da retrospectiva em stories precisa de um dado que nenhum
-- agregado contém: a maior distância de UMA ÚNICA corrida. Não dá para derivar
-- de `total_distance_km` nem de `plan_distance_completed_km`.
--
-- ── ESCOPO: DIFERENTE DO RESTO, DE PROPÓSITO ──────────────────────────────────
--
-- `plan_distance_completed_km` é plano-only (a Fase 1A existiu para isso: corrida
-- livre não pode inflar aderência). `longest_run_km` é o OPOSTO: conta TODAS as
-- corridas da janela, do plano e livres.
--
-- Não é inconsistência — é a distinção entre as duas perguntas. Aderência mede
-- cumprimento do plano; recorde é conquista pessoal. Quem bateu o recorde numa
-- corrida livre bateu o recorde do mesmo jeito, e esconder isso do card de
-- clímax seria mentir por tecnicismo.
--
-- Fonte: MAX(activities.distance) na janela do plano (a mesma de
-- plan-window.helper.ts, derivada de MIN/MAX(workouts.scheduled_date), que
-- respeita a re-âncora). Corrida livre também gera linha em `activities`, então
-- o MAX as cobre sem query extra — `calculateMetrics` já carrega esse array.
--
-- Aditiva e nullable: retrospectivas geradas antes desta migration ficam NULL, e
-- o card de clímax degrada (a UI esconde o card quando não há recorde).

ALTER TABLE plan_retrospectives
  ADD COLUMN IF NOT EXISTS longest_run_km   numeric(6,2),
  ADD COLUMN IF NOT EXISTS longest_run_date date;

COMMENT ON COLUMN plan_retrospectives.longest_run_km IS
  'Maior distância de UMA ÚNICA corrida no ciclo, em km. Conta plano E corrida livre — escopo deliberadamente diferente de plan_distance_completed_km (que é plano-only). Recorde é conquista pessoal, não medida de aderência.';

COMMENT ON COLUMN plan_retrospectives.longest_run_date IS
  'Dia (São Paulo) em que o recorde do ciclo foi atingido. Em empate de distância, a corrida mais antiga vence.';
