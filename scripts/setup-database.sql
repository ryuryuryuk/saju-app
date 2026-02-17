-- Supabase 데이터베이스 설정 SQL
-- pgvector extension 활성화 (벡터 검색용)

-- 1. 기존 함수들 삭제
DROP FUNCTION IF EXISTS match_saju_chunks_by_source(vector, text, float, int);
DROP FUNCTION IF EXISTS match_saju_chunks(vector, float, int);

-- 2. 기존 테이블이 있다면 삭제 (주의: 기존 데이터 삭제됨)
DROP TABLE IF EXISTS saju_chunks CASCADE;

-- 3. pgvector extension 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 3. saju_chunks 테이블 생성
CREATE TABLE saju_chunks (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL, -- '자평진전', '궁통보감', '적천수'
  content TEXT NOT NULL, -- 청크 텍스트 내용
  embedding VECTOR(1536), -- OpenAI text-embedding-3-small의 차원
  metadata JSONB, -- 섹션명 등 추가 정보
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 기본 인덱스 생성 (빠른 검색을 위해)
CREATE INDEX saju_chunks_source_idx ON saju_chunks(source);

-- 5. 벡터 인덱스는 데이터 업로드 후에 생성 (성능 향상)
-- 데이터 업로드 후 아래 명령어를 별도로 실행하세요:
-- CREATE INDEX saju_chunks_embedding_idx ON saju_chunks
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- 4. RPC 함수: source별 필터링이 가능한 벡터 검색
CREATE OR REPLACE FUNCTION match_saju_chunks_by_source(
  query_embedding VECTOR(1536),
  source_filter TEXT,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  source TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    saju_chunks.id,
    saju_chunks.source,
    saju_chunks.content,
    saju_chunks.metadata,
    1 - (saju_chunks.embedding <=> query_embedding) AS similarity
  FROM saju_chunks
  WHERE
    saju_chunks.source = source_filter
    AND 1 - (saju_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY saju_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. 전체 검색 함수 (모든 source에서 검색)
CREATE OR REPLACE FUNCTION match_saju_chunks(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id BIGINT,
  source TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    saju_chunks.id,
    saju_chunks.source,
    saju_chunks.content,
    saju_chunks.metadata,
    1 - (saju_chunks.embedding <=> query_embedding) AS similarity
  FROM saju_chunks
  WHERE 1 - (saju_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY saju_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 완료 메시지
SELECT 'Database setup complete!' AS status;
