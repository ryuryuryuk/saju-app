-- Daily usage tracking table (rate limiting)
CREATE TABLE IF NOT EXISTS daily_usage (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 0,
  UNIQUE(platform, platform_user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_user ON daily_usage(platform, platform_user_id, date);

-- Saju pillar cache (for API fallback)
CREATE TABLE IF NOT EXISTS saju_pillar_cache (
  cache_key TEXT PRIMARY KEY,
  pillars JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cleanup function for old cache entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_caches()
RETURNS VOID AS $$
BEGIN
  -- Clean daily_usage older than 90 days
  DELETE FROM daily_usage WHERE date < CURRENT_DATE - INTERVAL '90 days';
  -- Clean saju_pillar_cache older than 1 year
  DELETE FROM saju_pillar_cache WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$ LANGUAGE plpgsql;
