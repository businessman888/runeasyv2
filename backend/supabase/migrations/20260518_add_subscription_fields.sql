-- Add subscription fields to users table for Free vs Pro gating.
-- The mobile SDK (RevenueCat) was the only source of truth before this migration.
-- Now the backend persists plan state so the webhook (POST /webhooks/revenuecat)
-- can react to renewal/expiration even when the app is closed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_plan IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revenuecat_user_id TEXT;

-- Widen subscription_status check to accept the full state machine used by the
-- new webhook handler. The column already exists with a narrower constraint
-- in some environments; drop it before recreating to stay idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'users' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_status_check;
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_subscription_status_check
    CHECK (subscription_status IN ('active', 'trial', 'expired', 'cancelled', 'billing_issue'));

-- Filter users by plan/status on the subscription dashboard and admin queries.
CREATE INDEX IF NOT EXISTS idx_users_subscription
  ON users(subscription_plan, subscription_status);

-- Idempotency for RevenueCat events so a replay never double-credits or
-- regenerates a plan. Each event_id from RC is stored once.
CREATE TABLE IF NOT EXISTS revenuecat_events (
  event_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_user
  ON revenuecat_events(user_id, processed_at DESC);
