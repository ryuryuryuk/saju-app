// 사주 고서를 현대적이고 친근한 언어로 재작성
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수 로드
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Claude로 텍스트 재작성
async function rewriteText(originalText, bookName) {
  console.log(`\n📝 ${bookName} 재작성 중...`);

  const systemPrompt = `당신은 사주명리학을 현대인에게 쉽고 재미있게 설명하는 전문가입니다.

아래 원칙에 따라 고서 내용을 재작성해주세요:

1. **고서 원문 제거**: 한문 원문은 모두 삭제하세요. 현대어 해석만 남깁니다.

2. **친근한 말투**:
   - "~입니다", "~합니다" 대신 "~이에요", "~해요"
   - 마치 친구에게 설명하듯 편하게
   - 예: "갑목은 큰 나무예요. 뿌리가 깊고 당당하죠."

3. **구체적인 비유와 예시**:
   - 추상적인 개념은 일상의 예시로 설명
   - 오행을 현대 직업, 성격, 상황에 비유
   - 예: "수(水)는 물처럼 흐르는 에너지예요. IT 개발자처럼 정보를 다루거나, 컨설턴트처럼 유연하게 대응하는 스타일이죠."

4. **실용적인 조언**:
   - 각 명식에 맞는 구체적인 삶의 조언
   - 피해야 할 것, 추구해야 할 것
   - 예: "여름에 태어난 목(木)은 너무 건조해요. 휴식(水)이 필요하고, 무리한 도전(火)은 자제하세요."

5. **간결한 구조**:
   - 섹션 제목은 [키워드] 형식 유지
   - 한 문단은 2-3문장 이내
   - 중요한 내용은 **굵게** 표시

6. **감정적 공감**:
   - "힘들었겠어요", "이해돼요" 같은 공감 표현
   - 긍정적이고 희망적인 톤

원본 텍스트의 핵심 지식은 유지하되, 20대 대학생도 쉽게 이해할 수 있게 재작성하세요.`;

  const userMessage = `다음 사주 고서 텍스트를 위 원칙에 따라 재작성해주세요:

${originalText}

재작성된 전체 텍스트만 출력하세요. 추가 설명은 필요 없습니다.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const rewrittenText = response.content[0].text;
    console.log(`✅ ${bookName} 재작성 완료 (${response.usage.output_tokens} 토큰)`);

    return rewrittenText;
  } catch (error) {
    console.error(`❌ ${bookName} 재작성 실패:`, error.message);
    throw error;
  }
}

// 청크로 나누어 처리 (텍스트가 너무 길 경우)
function splitTextIntoSections(text) {
  // 섹션으로 나누기 ([ ] 로 시작하는 줄을 기준으로)
  const sections = text.split(/(?=\[.*?\])/);
  return sections.filter(s => s.trim().length > 50);
}

async function rewriteInChunks(sections, bookName) {
  const rewrittenSections = [];

  // 섹션을 그룹으로 묶어서 처리 (한번에 5개씩)
  const chunkSize = 5;
  for (let i = 0; i < sections.length; i += chunkSize) {
    const chunk = sections.slice(i, i + chunkSize).join('\n\n');
    console.log(`  처리 중: ${i + 1}~${Math.min(i + chunkSize, sections.length)}/${sections.length} 섹션`);

    const rewritten = await rewriteText(chunk, `${bookName} (${i + 1}~${Math.min(i + chunkSize, sections.length)})`);
    rewrittenSections.push(rewritten);

    // API rate limit 고려
    if (i + chunkSize < sections.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return rewrittenSections.join('\n\n');
}

// 메인 함수
async function main() {
  console.log('🚀 사주 고서 현대어 재작성 시작\n');
  console.log('='.repeat(80));

  const books = [
    { file: '자평진전.txt', source: '자평진전' },
    { file: '궁통보감.txt', source: '궁통보감' },
    { file: '적천수.txt', source: '적천수' }
  ];

  for (const book of books) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📖 ${book.source} 처리 중...`);
    console.log('='.repeat(80));

    // 1. 원본 파일 읽기
    const filePath = path.join(__dirname, '..', 'data', book.file);
    const originalText = fs.readFileSync(filePath, 'utf-8');
    console.log(`✅ 원본 파일 읽기: ${(originalText.length / 1024).toFixed(1)}KB`);

    // 2. 섹션으로 나누기
    const sections = splitTextIntoSections(originalText);
    console.log(`✅ 섹션 분할: ${sections.length}개`);

    // 3. 재작성
    const rewrittenText = await rewriteInChunks(sections, book.source);

    // 4. 새 파일로 저장
    const newFilePath = path.join(__dirname, '..', 'data', `${book.file.replace('.txt', '')}_현대어.txt`);
    fs.writeFileSync(newFilePath, rewrittenText, 'utf-8');
    console.log(`✅ 저장 완료: ${book.file.replace('.txt', '')}_현대어.txt`);

    // 5. 미리보기
    console.log('\n📝 미리보기 (처음 500자):\n');
    console.log(rewrittenText.substring(0, 500) + '...\n');
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎉 재작성 완료!');
  console.log('\n📁 생성된 파일:');
  console.log('  - data/자평진전_현대어.txt');
  console.log('  - data/궁통보감_현대어.txt');
  console.log('  - data/적천수_현대어.txt');
  console.log('\n💡 다음 단계:');
  console.log('  1. 미리보기를 확인하고 마음에 드는지 체크');
  console.log('  2. 마음에 들면 원본 파일 대체:');
  console.log('     cp data/자평진전_현대어.txt data/자평진전.txt');
  console.log('  3. node scripts/upload-embeddings.js 실행');
  console.log('='.repeat(80) + '\n');
}

// 실행
main().catch(error => {
  console.error('❌ 오류 발생:', error);
  process.exit(1);
});
