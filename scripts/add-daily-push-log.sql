-- daily_push_log: 매일 발송 결과 기록
CREATE TABLE IF NOT EXISTS daily_push_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  category TEXT,
  message_text TEXT,
  is_opened BOOLEAN DEFAULT FALSE,
  converted_to_premium BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'retried'))
);

CREATE INDEX IF NOT EXISTS idx_push_log_user ON daily_push_log(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_log_sent ON daily_push_log(sent_at DESC);

-- user_profiles에 is_active 컬럼 추가 (봇 차단 사용자 관리)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
