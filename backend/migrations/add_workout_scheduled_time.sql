-- Migration: Add scheduled_time field to workouts table
-- This allows storing the time when a workout is scheduled
-- Default time is 05:00 (5:00 AM)

ALTER TABLE workouts 
ADD COLUMN IF NOT EXISTS scheduled_time TIME DEFAULT '05:00:00';

-- Add index for efficient queries on scheduled_date + scheduled_time
CREATE INDEX IF NOT EXISTS idx_workouts_schedule ON workouts(scheduled_date, scheduled_time, status);

-- Comment
COMMENT ON COLUMN workouts.scheduled_time IS 'Time when the workout is scheduled (defaults to 05:00)';
