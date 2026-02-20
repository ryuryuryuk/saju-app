-- ab_tests: A/B testing for daily push message tones
CREATE TABLE IF NOT EXISTS ab_tests (
  id BIGSERIAL PRIMARY KEY,
  test_name TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  user_id TEXT NOT NULL,
  category TEXT,
  tone_description TEXT,
  message_text TEXT,
  opened BOOLEAN DEFAULT FALSE,
  converted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_test ON ab_tests(test_name, variant);
CREATE INDEX IF NOT EXISTS idx_ab_tests_user ON ab_tests(user_id, test_name);
CREATE INDEX IF NOT EXISTS idx_ab_tests_created ON ab_tests(created_at DESC);
