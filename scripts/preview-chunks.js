// 청크 분할 미리보기 스크립트
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 텍스트를 청크로 나누기 (upload-embeddings.js와 동일한 로직)
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

// 메인 함수
function main() {
  const books = [
    { file: '자평진전.txt', source: '자평진전' },
    { file: '궁통보감.txt', source: '궁통보감' },
    { file: '적천수.txt', source: '적천수' }
  ];

  console.log('📚 사주 고서 청크 분할 미리보기\n');
  console.log('='.repeat(80));

  books.forEach((book, bookIndex) => {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`📖 ${book.source}`);
    console.log('='.repeat(80));

    // 텍스트 파일 읽기
    const filePath = path.join(__dirname, '..', 'data', book.file);
    const text = fs.readFileSync(filePath, 'utf-8');

    console.log(`\n📊 원본 파일 정보:`);
    console.log(`  - 파일 크기: ${(text.length / 1024).toFixed(1)}KB`);
    console.log(`  - 전체 글자 수: ${text.length.toLocaleString()}자`);

    // 청크로 나누기
    const chunks = splitIntoChunks(text, book.source);

    console.log(`\n✂️  청크 분할 결과:`);
    console.log(`  - 총 청크 수: ${chunks.length}개`);
    console.log(`  - 평균 크기: ${Math.round(chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length).toLocaleString()}자`);

    // 각 청크 미리보기
    console.log(`\n📝 청크 미리보기 (처음 5개):\n`);
    chunks.slice(0, 5).forEach((chunk, i) => {
      console.log(`┌─ 청크 #${i + 1} ─────────────────────────────────────────────────`);
      console.log(`│ 섹션: ${chunk.metadata.section}`);
      console.log(`│ 크기: ${chunk.content.length}자`);
      console.log(`│`);
      console.log(`│ 내용 미리보기 (처음 200자):`);
      console.log(`│ ${chunk.content.substring(0, 200).replace(/\n/g, '\n│ ')}...`);
      console.log(`└${'─'.repeat(70)}\n`);
    });

    // 섹션별 통계
    const sectionStats = {};
    chunks.forEach(chunk => {
      const section = chunk.metadata.section;
      if (!sectionStats[section]) {
        sectionStats[section] = { count: 0, totalChars: 0 };
      }
      sectionStats[section].count++;
      sectionStats[section].totalChars += chunk.content.length;
    });

    console.log(`\n📊 섹션별 통계:\n`);
    Object.entries(sectionStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .forEach(([section, stats]) => {
        console.log(`  ${section}`);
        console.log(`    - 청크 수: ${stats.count}개`);
        console.log(`    - 총 글자: ${stats.totalChars.toLocaleString()}자`);
        console.log(`    - 평균: ${Math.round(stats.totalChars / stats.count).toLocaleString()}자\n`);
      });

    if (bookIndex < books.length - 1) {
      console.log('\n\n');
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ 미리보기 완료!');
  console.log('\n💡 다음 단계: node scripts/upload-embeddings.js 실행');
  console.log('='.repeat(80) + '\n');
}

// 실행
try {
  main();
} catch (error) {
  console.error('❌ 오류 발생:', error);
  process.exit(1);
}
