-- Create user_onboarding table to track quiz completion
CREATE TABLE IF NOT EXISTS user_onboarding (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE,
    quiz_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_onboarding_user_id ON user_onboarding(user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_completed ON user_onboarding(completed_at) WHERE completed_at IS NOT NULL;

-- Add comment
COMMENT ON TABLE user_onboarding IS 'Tracks user onboarding quiz completion status';
COMMENT ON COLUMN user_onboarding.quiz_data IS 'Stores user quiz answers (objective, level, frequency, etc.)';
