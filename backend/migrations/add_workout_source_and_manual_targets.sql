-- =====================================================================
-- Migration: Support free runs and user-created manual workouts
-- =====================================================================
-- Adds:
--   source                  - distinguishes plan-generated, user-created
--                             manual, and free (untracked) workouts
--   title                   - user-defined title for manual / free runs
--   target_pace_seconds     - planned pace in seconds per km (manual)
--   target_duration_seconds - planned total duration in seconds (manual)
-- =====================================================================

ALTER TABLE workouts
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'plan',
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS target_pace_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS target_duration_seconds INTEGER;

-- Restrict source to known values. New workout types ('free_run', 'fartlek',
-- 'progressive') are allowed in the existing free-form `type` column without
-- additional constraints.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workouts_source_check'
    ) THEN
        ALTER TABLE workouts
            ADD CONSTRAINT workouts_source_check
            CHECK (source IN ('plan', 'manual', 'free'));
    END IF;
END $$;

-- Calendar / Home queries filter by user + source + date.
CREATE INDEX IF NOT EXISTS idx_workouts_user_source_date
    ON workouts(user_id, source, scheduled_date DESC);

COMMENT ON COLUMN workouts.source IS
    'Origin of the workout: plan (AI-generated), manual (user-defined), free (free run captured retroactively)';
COMMENT ON COLUMN workouts.title IS
    'User-defined workout title. Only set for source=manual|free.';
COMMENT ON COLUMN workouts.target_pace_seconds IS
    'Planned pace in seconds per km. Only set for source=manual.';
COMMENT ON COLUMN workouts.target_duration_seconds IS
    'Planned total duration in seconds. Only set for source=manual.';
