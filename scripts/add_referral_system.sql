-- ===== 추천 시스템 (Referral System) =====
-- 실행: Supabase Dashboard > SQL Editor

-- 1. user_profiles 테이블에 컬럼 추가
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS free_unlocks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- 2. referral_code 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_profiles_referral_code
ON user_profiles(referral_code);

-- 3. 무료 열람권 증가 함수
CREATE OR REPLACE FUNCTION increment_free_unlocks(
  p_platform TEXT,
  p_user_id TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_profiles
  SET free_unlocks = COALESCE(free_unlocks, 0) + p_amount
  WHERE platform = p_platform AND platform_user_id = p_user_id;
END;
$$;

-- 4. 무료 열람권 차감 함수 (0 이하로 내려가지 않음)
CREATE OR REPLACE FUNCTION decrement_free_unlocks(
  p_platform TEXT,
  p_user_id TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_profiles
  SET free_unlocks = GREATEST(COALESCE(free_unlocks, 0) - 1, 0)
  WHERE platform = p_platform AND platform_user_id = p_user_id;
END;
$$;

-- 5. 추천 로그 테이블 (선택사항 - 분석용)
CREATE TABLE IF NOT EXISTS referral_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_platform TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  referred_platform TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS 정책 (보안)
ALTER TABLE referral_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage referral_logs"
ON referral_logs
FOR ALL
USING (true)
WITH CHECK (true);
