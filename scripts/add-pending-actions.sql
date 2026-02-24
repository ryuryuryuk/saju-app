-- pending_actions 테이블 생성
-- 서버리스 환경에서 in-memory 상태 대체 (궁합 대기, 추천 코드 대기 등)

CREATE TABLE IF NOT EXISTS pending_actions (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,               -- 'telegram', 'kakao'
  platform_user_id TEXT NOT NULL,       -- 플랫폼 유저 ID
  action_type TEXT NOT NULL,            -- 'compatibility', 'referral' 등
  payload JSONB NOT NULL DEFAULT '{}',  -- 대기 상태 데이터
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS pending_actions_lookup_idx
  ON pending_actions(platform, platform_user_id, action_type);

-- 만료된 항목 정리용 인덱스
CREATE INDEX IF NOT EXISTS pending_actions_expires_idx
  ON pending_actions(expires_at);

-- 유니크 제약 (같은 유저의 같은 타입 대기는 1개만)
CREATE UNIQUE INDEX IF NOT EXISTS pending_actions_unique_idx
  ON pending_actions(platform, platform_user_id, action_type);

SELECT 'pending_actions table created!' AS status;
