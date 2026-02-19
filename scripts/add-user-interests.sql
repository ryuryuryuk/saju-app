-- user_interests 테이블: 사용자별 관심 카테고리 점수 추적
CREATE TABLE IF NOT EXISTS user_interests (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,                -- 'telegram', 'kakao'
  platform_user_id TEXT NOT NULL,
  category TEXT NOT NULL,                -- money, love, career, health, relationships, academics, general
  score FLOAT NOT NULL DEFAULT 0,        -- 0~100 (빈도 기반 비율)
  ask_count INT NOT NULL DEFAULT 0,      -- 해당 카테고리 총 질문 수
  weighted_count FLOAT NOT NULL DEFAULT 0, -- 시간 가중치 적용된 카운트
  last_asked TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(platform, platform_user_id, category)
);

CREATE INDEX IF NOT EXISTS user_interests_user_idx
  ON user_interests(platform, platform_user_id);

CREATE INDEX IF NOT EXISTS user_interests_score_idx
  ON user_interests(platform, platform_user_id, score DESC);

SELECT 'user_interests table created!' AS status;
