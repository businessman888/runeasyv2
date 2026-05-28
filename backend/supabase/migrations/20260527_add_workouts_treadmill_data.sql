-- Migration: Add `treadmill_data` JSONB column to workouts
-- Date: 2026-05-27
-- Description:
--   Belt-and-suspenders backup for treadmill telemetry. Until now the
--   FTMS / manual telemetry payload was only persisted on the
--   `activities` row inserted by `completeWorkout`. That works as long
--   as (a) the activity insert succeeds AND (b) the workout-to-activity
--   link (`workouts.activity_id`) is written.
--
--   Both have failed in the wild — for example, when the user retries
--   the same workout the second insert hits the `activities.external_id`
--   UNIQUE constraint and the activity row is never linked. When that
--   happens, `getWorkout` falls into the "synthesize activity" branch and
--   has nowhere to read the chart data from — the speed-variation card
--   ends up blank on RunSummary / CoachAnalysis (observed after a fresh
--   reinstall when the local MMKV cache was wiped too).
--
--   Storing the payload on `workouts` as well guarantees the chart
--   survives any of the activity-side failure modes, because the
--   workouts UPDATE in `completeWorkout` is the one operation we know
--   always succeeds (the workout couldn't have been marked completed
--   otherwise).
--
--   The activities column is kept as the canonical source — feedback
--   generation and analytics still read from there. The workouts column
--   is a read-only fallback for the UI hydration path.

ALTER TABLE workouts
ADD COLUMN IF NOT EXISTS treadmill_data JSONB;
