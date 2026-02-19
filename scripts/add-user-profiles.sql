-- user_profiles 테이블 생성
-- Telegram/Kakao 사용자 프로필을 영구 저장하여 맞춤형 사주 분석 제공

CREATE TABLE IF NOT EXISTS user_profiles (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,               -- 'telegram', 'kakao'
  platform_user_id TEXT NOT NULL,       -- Telegram user ID or Kakao user ID
  display_name TEXT,                    -- 사용자 이름/닉네임
  birth_year INT NOT NULL,
  birth_month INT NOT NULL,
  birth_day INT NOT NULL,
  birth_hour INT NOT NULL DEFAULT 12,
  birth_minute INT NOT NULL DEFAULT 0,
  gender TEXT NOT NULL,                 -- '남성', '여성'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(platform, platform_user_id)
);

-- 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS user_profiles_platform_idx
  ON user_profiles(platform, platform_user_id);

-- conversation_history 테이블 (인메모리 대체)
CREATE TABLE IF NOT EXISTS conversation_history (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  role TEXT NOT NULL,                   -- 'user', 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conv_history_user_idx
  ON conversation_history(platform, platform_user_id, created_at DESC);

SELECT 'user_profiles & conversation_history tables created!' AS status;
