-- Add onboarding_completed column to users table
-- This flag controls whether user can access Home or is locked in Onboarding

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Backfill existing users who have completed onboarding
-- (those who have a record in user_onboarding with completed_at set)
UPDATE users 
SET onboarding_completed = TRUE 
WHERE id IN (
    SELECT user_id 
    FROM user_onboarding 
    WHERE completed_at IS NOT NULL
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON users(onboarding_completed);

COMMENT ON COLUMN users.onboarding_completed IS 'Controls navigation: false=locked in Onboarding, true=can access Home';
