-- Migration: Add treadmill support to workouts and activities
-- Date: 2026-05-26
-- Description:
--   Adds `environment` ('outdoor' | 'treadmill') to both workouts and
--   activities so we can distinguish runs done on a treadmill from outdoor
--   GPS runs. Adds `treadmill_data` (JSONB) to activities for the FTMS
--   metadata (device name, avg/max speed, incline, calories, samples).
--
--   GPS columns (`gps_route`, `workout_routes.*`) are already nullable, so
--   no further schema changes are needed for the route side.

-- 1. workouts.environment
ALTER TABLE workouts
ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'outdoor'
  CHECK (environment IN ('outdoor', 'treadmill'));

-- 2. activities.environment
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'outdoor'
  CHECK (environment IN ('outdoor', 'treadmill'));

-- 3. activities.treadmill_data
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS treadmill_data JSONB;

-- 4. Indexes for environment filtering on history/summary screens
CREATE INDEX IF NOT EXISTS idx_workouts_environment ON workouts(environment);
CREATE INDEX IF NOT EXISTS idx_activities_environment ON activities(environment);
