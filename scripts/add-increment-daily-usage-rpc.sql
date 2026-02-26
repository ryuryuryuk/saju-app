-- Atomic daily usage increment (avoids race condition)
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION increment_daily_usage(
  p_platform TEXT,
  p_user_id TEXT,
  p_date TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_usage (platform, platform_user_id, date, count)
  VALUES (p_platform, p_user_id, p_date, 1)
  ON CONFLICT (platform, platform_user_id, date)
  DO UPDATE SET count = daily_usage.count + 1;
END;
$$ LANGUAGE plpgsql;
