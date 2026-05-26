-- Referral / Influencer system: lets influencers have personal codes that grant
-- users a discounted paywall on first purchase and pay the influencer commission
-- on the user's first N renewals (default 3 months at 50%).

-- Influencers catalog (one row per creator). Code is matched case-insensitively.
CREATE TABLE IF NOT EXISTS influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(255),
  pix_key VARCHAR(255),
  commission_rate DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  max_commission_months INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_referrals INTEGER NOT NULL DEFAULT 0,
  total_revenue_generated DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_commission_earned DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- Case-insensitive lookup for validation endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_influencers_code_lower
  ON influencers (LOWER(code));

-- Vínculo user ↔ influencer. UNIQUE(user_id) impede dupla aplicação.
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE RESTRICT,
  code_used VARCHAR(30) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_purchase_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'converted', 'expired')),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_influencer ON referrals(influencer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_user ON referrals(user_id);

-- Comissões mensais. Uma linha por mês de cobrança até max_commission_months.
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE RESTRICT,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_number INTEGER NOT NULL CHECK (month_number > 0),
  gross_amount DECIMAL(10,2) NOT NULL,
  store_fee DECIMAL(10,2) NOT NULL,
  net_amount DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  UNIQUE (referral_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_commissions_influencer ON commissions(influencer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_referral ON commissions(referral_id);

-- Backend uses service role (bypasses RLS); RLS is still enabled as defense
-- in depth so the tables are not reachable from the anon Data API.
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
