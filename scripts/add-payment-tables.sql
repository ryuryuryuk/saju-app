-- Payment system tables for saju-app

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_key TEXT,
  toss_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_platform_user ON orders(platform, platform_user_id);
CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Credit transactions log
CREATE TABLE IF NOT EXISTS credit_transactions (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_user ON credit_transactions(platform, platform_user_id);

-- Add credits column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'none',
  expires_at TIMESTAMPTZ,
  billing_key TEXT,
  auto_renew BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_user_id)
);

-- Daily usage tracking
CREATE TABLE IF NOT EXISTS daily_usage (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 0,
  UNIQUE(platform, platform_user_id, date)
);

-- Purchased products (one-time products like yearly fortune)
CREATE TABLE IF NOT EXISTS purchased_products (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  order_id TEXT REFERENCES orders(order_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RPC: Increment credits
CREATE OR REPLACE FUNCTION increment_credits(
  p_platform TEXT,
  p_user_id TEXT,
  p_amount INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE user_profiles
  SET credits = COALESCE(credits, 0) + p_amount
  WHERE platform = p_platform AND platform_user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Decrement credits (safe, won't go below 0)
CREATE OR REPLACE FUNCTION decrement_credits(
  p_platform TEXT,
  p_user_id TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE user_profiles
  SET credits = GREATEST(COALESCE(credits, 0) - 1, 0)
  WHERE platform = p_platform AND platform_user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
