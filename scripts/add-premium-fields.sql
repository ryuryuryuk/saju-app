-- user_profiles에 프리미엄 관련 컬럼 추가
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;
