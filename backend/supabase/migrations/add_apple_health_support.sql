-- Apple HealthKit integration support
-- Fase 0 of Apple Health integration: schema adjustments

-- 1. HealthKit has no access token (local permission only), so make column nullable.
ALTER TABLE connected_devices ALTER COLUMN access_token DROP NOT NULL;

-- 2. Store GPS route (HKWorkoutRoute) on activities as JSONB.
--    Shape: [{ lat: number, lng: number, altitude?: number, timestamp: number }]
ALTER TABLE activities ADD COLUMN IF NOT EXISTS gps_route JSONB;

-- 3. Index used by cross-provider temporal deduplication (±5 min windows).
CREATE INDEX IF NOT EXISTS idx_activities_user_start_date
    ON activities(user_id, start_date DESC);
