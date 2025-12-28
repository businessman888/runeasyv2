-- Migration: Create readiness_checkins table
-- Description: Tracks daily readiness check-in availability and completion status

CREATE TABLE IF NOT EXISTS readiness_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    checkin_date DATE NOT NULL,
    completed_at TIMESTAMPTZ,
    is_available BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_checkin_date UNIQUE(user_id, checkin_date)
);

-- Indexes for performance
CREATE INDEX idx_readiness_checkins_user_date ON readiness_checkins(user_id, checkin_date);
CREATE INDEX idx_readiness_checkins_available ON readiness_checkins(is_available) WHERE is_available = true;

-- Comments
COMMENT ON TABLE readiness_checkins IS 'Tracks daily readiness check-in availability and completion';
COMMENT ON COLUMN readiness_checkins.user_id IS 'User who owns this check-in';
COMMENT ON COLUMN readiness_checkins.checkin_date IS 'Date for this check-in (without time component)';
COMMENT ON COLUMN readiness_checkins.completed_at IS 'When user completed the check-in';
COMMENT ON COLUMN readiness_checkins.is_available IS 'Whether check-in is available for this date';
