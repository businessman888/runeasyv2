-- =====================================================================
-- Migration: Add completion tracking columns to workouts table
-- These columns are used by POST /training/workouts/:id/complete
-- to store native GPS tracking data when a user finishes a workout
-- =====================================================================

-- Distance actually run (km) — from GPS tracking
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS distance_run DECIMAL;

-- Duration of the run in seconds — from app timer
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS time_run_seconds INTEGER;

-- Average pace in seconds per km — calculated: duration_seconds / distance_km
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS pace_seconds_per_km DECIMAL;

-- Timestamp when the workout was completed
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Index for querying completed workouts efficiently
CREATE INDEX IF NOT EXISTS idx_workouts_completed_at ON workouts(completed_at) WHERE completed_at IS NOT NULL;

-- =====================================================================
-- Also ensure workout_routes table exists (for GPS route storage)
-- Requires PostGIS extension
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS workout_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    route geometry(LineString, 4326),
    raw_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workout_routes_route_gix ON workout_routes USING GIST (route);
CREATE INDEX IF NOT EXISTS workout_routes_workout_id_idx ON workout_routes(workout_id);
