-- Add new onboarding columns for pace, goal_timeframe, and pace data
-- These support the complete onboarding quiz flow

-- Goal duration in months (1, 3, 6, 12)
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS goal_timeframe INTEGER;

-- Pace data from PaceConfirmScreen
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS pace_minutes TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS pace_seconds TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS dont_know_pace BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN user_onboarding.goal_timeframe IS 'Goal timeframe in months (1, 3, 6, 12)';
COMMENT ON COLUMN user_onboarding.pace_minutes IS 'User-entered pace minutes (MM)';
COMMENT ON COLUMN user_onboarding.pace_seconds IS 'User-entered pace seconds (SS)';
COMMENT ON COLUMN user_onboarding.dont_know_pace IS 'Whether user selected "I dont know my pace"';
