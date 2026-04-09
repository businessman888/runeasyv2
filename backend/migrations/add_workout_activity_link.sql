-- =====================================================================
-- Migration: Ensure workouts.activity_id link column exists
-- This column links a workout to the executed activity row that was
-- captured by native GPS tracking (or by a wearable provider sync).
-- The feedback pipeline, the HomeScreen "Análise do Treinador" card,
-- and the sharing service all depend on this link.
-- =====================================================================

ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS activity_id UUID
    REFERENCES activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_activity_id
    ON workouts(activity_id)
    WHERE activity_id IS NOT NULL;

-- Ensure activities table can store the raw GPS trace from the phone,
-- mirroring the column already used by the Apple HealthKit ingestion path.
ALTER TABLE activities
    ADD COLUMN IF NOT EXISTS gps_route JSONB;
