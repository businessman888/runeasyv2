-- =====================================================================
-- COMPLETE migration: Add ALL individual quiz columns to user_onboarding
-- The original table only had: id, user_id, completed_at, quiz_data
-- The controller upsert writes ~20 columns that must exist
-- =====================================================================

-- Biometrics
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS birth_date TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS weight DECIMAL;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS height DECIMAL;

-- Core fields
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS days_per_week INTEGER;

-- Availability
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS available_days JSONB;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS intense_day_index INTEGER;

-- Pace data
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS current_pace_5k DECIMAL;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS pace_minutes TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS pace_seconds TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS dont_know_pace BOOLEAN DEFAULT false;

-- Goal duration
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS goal_timeframe INTEGER;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS target_weeks INTEGER;

-- Limitations
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS has_limitations BOOLEAN DEFAULT false;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS limitations TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS preferred_days JSONB;

-- Performance Baseline
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS recent_distance DECIMAL;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS distance_time JSONB;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS calculated_pace DECIMAL;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS start_date TEXT;

-- Full quiz snapshot
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS responses_json JSONB;
