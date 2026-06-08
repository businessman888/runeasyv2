-- Migration: Google Health Connect (Android) support
-- Date: 2026-05-28
-- Description:
--   1. Document the new device-local source value 'health_connect'
--      (Android equivalent of 'apple_health'). No schema change is needed
--      on `activities.source` — the column is a free TEXT with no CHECK
--      constraint, and the backend normalizer enforces the `hc_` prefix on
--      `external_id` to guarantee global uniqueness via the existing
--      `activities.external_id` UNIQUE constraint.
--   2. Create a partial index that accelerates the plan-reconciliation
--      query in ActivitySyncService.findMatchingPlanWorkout — every
--      device-local sync (Apple Health + Health Connect) now looks up
--      pending plan workouts in a ±1 day window for the user.

COMMENT ON COLUMN activities.source IS
    'Origin of the activity row. Values: phone | phone_redundant | '
    'apple_watch | garmin | fitbit | polar | apple_health | health_connect. '
    'Device-local sources (apple_health, health_connect) are reconciled '
    'with plan workouts inside ActivitySyncService.processDeviceLocalActivity.';

-- Used by the plan reconciliation query (Pro users): finds pending plan
-- workouts whose scheduled_date is within ±1 day of the run's São Paulo
-- date. Partial index keeps it tiny — only pending rows are searched.
CREATE INDEX IF NOT EXISTS idx_workouts_user_status_date
    ON workouts(user_id, scheduled_date)
    WHERE status = 'pending';
