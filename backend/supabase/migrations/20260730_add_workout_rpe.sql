-- Fase 0 — RPE reportado pelo usuário (Borg CR10, escala 1–10).
--
-- CONTEXTO: a auditoria de 2026-07-30 confirmou que o produto não captura
-- percepção de esforço REPORTADA. O que existe hoje é
-- `workouts.metadata.perceived_effort` — o esforço PRESCRITO pela IA na geração
-- do plano (ex.: "7/10"), exibido no app como se fosse RPE. São dados distintos:
-- um é o que o treinador manda fazer, o outro é o que o atleta sentiu.
--
-- Sem RPE reportado não há carga interna (sRPE = RPE × duração), que é o insumo
-- da Fase 7 (ACWR/monotonia). Esta é a única mudança irreversível no tempo do
-- roadmap: cada semana sem coletar é dado que não volta.
--
-- ── POR QUE EM `workouts` E NÃO EM `activities` ────────────────────────────────
--
-- 1. `activities` é gravada por UPSERT com `onConflict: 'external_id'`
--    (training.service.ts, completeWorkout). Um re-sync de wearable sobre a mesma
--    corrida reexecuta o upsert SEM rpe no payload — sobrescreveria o valor
--    reportado com NULL, destruindo o dado silenciosamente. `workouts` só é
--    atualizada por caminhos que conhecem o RPE.
--
-- 2. sRPE = RPE × duração, e `time_run_seconds` já está nesta mesma linha.
--
-- 3. A agregação da Fase 2 é escopada por `week_number` / `plan_id` — colunas que
--    só existem em `workouts`.
--
-- 4. Corrida livre também cria linha em `workouts` (`source='free'`, via
--    completeFreeWorkout), então nada fica de fora da coleta.
--
-- ── FORMA ─────────────────────────────────────────────────────────────────────
--
-- Aditiva e nullable: RPE é OPCIONAL por decisão de produto (nunca bloqueia a
-- conclusão do treino). Treinos existentes e futuros sem resposta ficam NULL, e
-- todo consumidor precisa tratar a ausência. O CHECK aceita NULL (semântica
-- padrão do Postgres: CHECK só reprova quando a expressão é FALSE).
--
-- As RLS existentes cobrem a nova coluna — não há mudança na forma da linha.

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS rpe SMALLINT;

ALTER TABLE workouts
  DROP CONSTRAINT IF EXISTS workouts_rpe_check;

ALTER TABLE workouts
  ADD CONSTRAINT workouts_rpe_check CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10));

COMMENT ON COLUMN workouts.rpe IS
  'Percepção de esforço REPORTADA pelo usuário após o treino (Borg CR10, 1-10). Opcional. NÃO confundir com metadata.perceived_effort, que é o esforço PRESCRITO pela IA. Insumo de sRPE = rpe × time_run_seconds.';

-- Índice parcial: as consultas de carga (Fase 7) varrem só as linhas COM rpe,
-- por usuário e período. O parcial fica uma ordem de grandeza menor que o total
-- enquanto a coleta é opcional e recente.
CREATE INDEX IF NOT EXISTS idx_workouts_user_rpe
  ON workouts (user_id, scheduled_date)
  WHERE rpe IS NOT NULL;
