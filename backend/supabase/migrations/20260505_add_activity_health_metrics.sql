-- Migration: Add health metrics columns to activities table
-- Date: 2026-05-05
-- Description: Adds heart rate and calories columns so corridas vindas do
-- Apple Watch (HKWorkoutSession) e outros wearables possam persistir métricas
-- de saúde sem precisar de uma tabela paralela. Idempotente.

-- average_heartrate: BPM médio durante a corrida
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS average_heartrate INTEGER;

-- max_heartrate: BPM máximo registrado durante a corrida
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS max_heartrate INTEGER;

-- calories: kcal estimadas pela fonte (HealthKit, Garmin, etc.)
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS calories INTEGER;

-- Comentários (documentação inline no schema do Postgres)
COMMENT ON COLUMN activities.average_heartrate IS 'Average heart rate (BPM) during the activity. Sourced from wearable when available.';
COMMENT ON COLUMN activities.max_heartrate     IS 'Maximum heart rate (BPM) reached during the activity.';
COMMENT ON COLUMN activities.calories          IS 'Active calories burned (kcal). Sourced from wearable when available.';
