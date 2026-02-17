import pg from 'pg';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

// Extract project ref from Supabase URL
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

// Try connecting via Supabase connection pooler with JWT auth
const regions = [
  'ap-northeast-2', // Seoul
  'ap-northeast-1', // Tokyo
  'us-east-1',
  'us-west-1',
  'eu-west-1',
  'ap-southeast-1',
];

async function tryConnect() {
  for (const region of regions) {
    const connectionString = `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
    console.log(`🔄 Trying region: ${region}...`);
    try {
      const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
      await client.connect();
      console.log(`✅ Connected via pooler (${region})`);
      return client;
    } catch (err) {
      console.log(`  ❌ ${region}: ${err.message.slice(0, 80)}`);
    }
  }

  // Try direct connection
  const directUrl = `postgresql://postgres.${projectRef}:${serviceKey}@db.${projectRef}.supabase.com:5432/postgres`;
  console.log('🔄 Trying direct connection...');
  try {
    const client = new pg.Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('✅ Connected directly');
    return client;
  } catch (err) {
    console.log(`  ❌ Direct: ${err.message.slice(0, 80)}`);
  }

  return null;
}

async function migrate() {
  const client = await tryConnect();

  if (!client) {
    console.error('\n❌ 연결 실패. Supabase Dashboard SQL Editor에서 직접 실행해주세요.');
    process.exit(1);
  }

  const sql = `
    -- Enable pgvector extension
    create extension if not exists vector;

    -- Create saju_chunks table
    create table if not exists saju_chunks (
      id bigserial primary key,
      content text not null,
      embedding vector(1536),
      metadata jsonb not null default '{}',
      created_at timestamptz default now()
    );

    -- Create IVFFlat index (only if not exists)
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'saju_chunks_embedding_idx'
      ) THEN
        CREATE INDEX saju_chunks_embedding_idx ON saju_chunks
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 10);
      END IF;
    END
    $$;

    -- Create match function
    create or replace function match_saju_chunks(
      query_embedding vector(1536),
      match_threshold float default 0.5,
      match_count int default 5
    )
    returns table (
      id bigint, content text, metadata jsonb, similarity float
    )
    language sql stable
    as $func$
      select id, content, metadata,
        1 - (embedding <=> query_embedding) as similarity
      from saju_chunks
      where 1 - (embedding <=> query_embedding) > match_threshold
      order by embedding <=> query_embedding
      limit match_count;
    $func$;

    -- Create source-filtered match function (3단계 분석용)
    create or replace function match_saju_chunks_by_source(
      query_embedding vector(1536),
      source_filter text,
      match_threshold float default 0.3,
      match_count int default 3
    )
    returns table (
      id bigint, content text, metadata jsonb, similarity float
    )
    language sql stable
    as $func$
      select id, content, metadata,
        1 - (embedding <=> query_embedding) as similarity
      from saju_chunks
      where metadata->>'source' = source_filter
        and 1 - (embedding <=> query_embedding) > match_threshold
      order by embedding <=> query_embedding
      limit match_count;
    $func$;
  `;

  try {
    console.log('\n📦 테이블 및 함수 생성 중...');
    await client.query(sql);
    console.log('✅ 완료! saju_chunks 테이블과 match_saju_chunks 함수가 생성되었습니다.');
  } catch (err) {
    console.error('❌ SQL 실행 오류:', err.message);
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);
