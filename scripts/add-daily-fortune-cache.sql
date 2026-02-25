-- Daily fortune cache table
CREATE TABLE IF NOT EXISTS daily_fortune_cache (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_user_id, date)
);

CREATE INDEX idx_daily_fortune_cache_user ON daily_fortune_cache(platform, platform_user_id, date);

-- Auto cleanup (keep only last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_fortune_cache()
RETURNS VOID AS $$
BEGIN
  DELETE FROM daily_fortune_cache WHERE date < CURRENT_DATE - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
