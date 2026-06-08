-- Migration: Add wearable device support columns to activities table
-- Date: 2026-04-04
-- Description: Adds external_id and source columns to distinguish activity origin

-- external_id: unique identifier from the wearable provider (Garmin/Fitbit/Polar activity ID)
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;

-- source: where the activity data came from
-- Values: 'phone', 'garmin', 'fitbit', 'polar', 'apple_watch', 'phone_redundant'
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'phone';

-- Index on source for filtering queries
CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source);

-- Index on external_id for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_activities_external_id ON activities(external_id) WHERE external_id IS NOT NULL;
