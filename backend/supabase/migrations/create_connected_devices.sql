-- Migration: Create connected_devices table for wearable OAuth tokens
-- Date: 2026-04-04
-- Description: Stores encrypted OAuth tokens for Garmin, Fitbit, Polar, Apple Watch

CREATE TABLE IF NOT EXISTS connected_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,                -- 'garmin', 'fitbit', 'polar', 'apple_watch'
    provider_user_id TEXT,                 -- User ID on the provider's system
    access_token TEXT NOT NULL,            -- Encrypted (AES-256-GCM)
    refresh_token TEXT,                    -- Encrypted (AES-256-GCM)
    expires_at TIMESTAMPTZ,               -- Token expiration timestamp
    scope TEXT,                            -- OAuth scopes granted
    device_name TEXT,                      -- Optional: user-friendly device name
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- RLS: Users can only see their own connected devices
ALTER TABLE connected_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own devices"
    ON connected_devices FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices"
    ON connected_devices FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
    ON connected_devices FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices"
    ON connected_devices FOR DELETE
    USING (auth.uid() = user_id);

-- Service role bypass (backend uses service role key)
CREATE POLICY "Service role full access"
    ON connected_devices FOR ALL
    USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connected_devices_user_id ON connected_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_devices_provider ON connected_devices(provider);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_connected_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_connected_devices_updated_at
    BEFORE UPDATE ON connected_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_connected_devices_updated_at();
