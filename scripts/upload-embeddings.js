// 사주 고서 텍스트를 청크로 나누고 임베딩을 생성하여 Supabase에 업로드
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// ES module에서 __dirname 사용하기 위한 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수 로드
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 텍스트를 청크로 나누기 (섹션 기준)
function splitIntoChunks(text, source) {
  const chunks = [];

  // 섹션으로 나누기 ([ ] 로 시작하는 줄을 기준으로)
  const sections = text.split(/\n(?=\[)/);

  sections.forEach((section) => {
    section = section.trim();
    if (section.length < 50) return; // 너무 짧은 섹션은 제외

    // 섹션명 추출
    const sectionMatch = section.match(/^\[([^\]]+)\]/);
    const sectionName = sectionMatch ? sectionMatch[1] : '미분류';

    // 청크가 너무 크면 더 작게 나누기 (약 1000자 기준)
    if (section.length > 1500) {
      const paragraphs = section.split(/\n\n+/);
      let currentChunk = '';
      let currentSection = sectionName;

      paragraphs.forEach((para) => {
        if ((currentChunk + para).length > 1500 && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            metadata: { section: currentSection }
          });
          currentChunk = para;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + para;
        }
      });

      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: { section: currentSection }
        });
      }
    } else {
      chunks.push({
        content: section,
        metadata: { section: sectionName }
      });
    }
  });

  return chunks;
}

// 임베딩 생성 (배치 처리)
async function generateEmbeddings(texts) {
  console.log(`임베딩 생성 중: ${texts.length}개 청크`);

  // OpenAI API는 배치 요청을 지원하지만, 한번에 너무 많으면 에러가 날 수 있으므로 적절히 나누기
  const batchSize = 50;
  const embeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`  배치 ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} 처리 중...`);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });

    embeddings.push(...response.data.map(item => item.embedding));

    // API rate limit을 고려한 딜레이
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return embeddings;
}

// Supabase에 업로드
async function uploadToSupabase(source, chunks, embeddings) {
  console.log(`\n${source} Supabase에 업로드 중...`);

  const rows = chunks.map((chunk, i) => ({
    source,
    content: chunk.content,
    embedding: embeddings[i],
    metadata: chunk.metadata
  }));

  // 배치 업로드 (1000개씩)
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('saju_chunks')
      .insert(batch);

    if (error) {
      console.error(`❌ 업로드 실패 (배치 ${i / batchSize + 1}):`, error);
      throw error;
    }

    console.log(`  ✅ ${i + batch.length}/${rows.length} 업로드 완료`);
  }
}

// 메인 함수
async function main() {
  console.log('🚀 사주 고서 임베딩 업로드 시작\n');

  const books = [
    { file: '자평진전.txt', source: '자평진전' },
    { file: '궁통보감.txt', source: '궁통보감' },
    { file: '적천수.txt', source: '적천수' }
  ];

  for (const book of books) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📖 ${book.source} 처리 중...`);
    console.log('='.repeat(50));

    // 1. 텍스트 파일 읽기
    const filePath = path.join(__dirname, '..', 'data', book.file);
    const text = fs.readFileSync(filePath, 'utf-8');
    console.log(`✅ 파일 읽기 완료: ${(text.length / 1024).toFixed(1)}KB`);

    // 2. 청크로 나누기
    const chunks = splitIntoChunks(text, book.source);
    console.log(`✅ 청크 분할 완료: ${chunks.length}개`);

    // 3. 임베딩 생성
    const texts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddings(texts);
    console.log(`✅ 임베딩 생성 완료: ${embeddings.length}개`);

    // 4. Supabase 업로드
    await uploadToSupabase(book.source, chunks, embeddings);
    console.log(`✅ ${book.source} 업로드 완료!\n`);
  }

  console.log('\n🎉 모든 작업 완료!');
  console.log('\n다음 단계:');
  console.log('1. Supabase에서 데이터 확인: SELECT COUNT(*), source FROM saju_chunks GROUP BY source;');
  console.log('2. 개발 서버 재시작 후 테스트');
}

// 실행
main().catch(error => {
  console.error('❌ 오류 발생:', error);
  process.exit(1);
});
