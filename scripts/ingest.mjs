import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// --- 적천수 청킹 ---
function chunk적천수(text) {
  const chunks = [];
  // Split by section headers: [적천수: 섹션명]
  const sectionRegex = /\[적천수:\s*(.+?)\]/g;
  const sectionMatches = [...text.matchAll(sectionRegex)];

  for (let i = 0; i < sectionMatches.length; i++) {
    const sectionName = sectionMatches[i][1].trim();
    const start = sectionMatches[i].index;
    const end = i + 1 < sectionMatches.length ? sectionMatches[i + 1].index : text.length;
    const sectionText = text.slice(start, end).trim();

    // Split section by numbered subsections (1. 2. 3.)
    const subSections = sectionText.split(/(?=^\d+\.\s)/m).filter(s => s.trim().length > 50);

    if (subSections.length <= 1) {
      // No subsections or single block - keep as one chunk
      chunks.push({
        content: sectionText,
        metadata: {
          source: '적천수',
          section: sectionName,
          type: 'classical_theory',
        },
      });
    } else {
      for (const sub of subSections) {
        const trimmed = sub.trim();
        if (trimmed.length < 50) continue;
        // Extract subsection title from first line
        const firstLine = trimmed.split('\n')[0].trim();
        chunks.push({
          content: trimmed,
          metadata: {
            source: '적천수',
            section: sectionName,
            subsection: firstLine.slice(0, 60),
            type: 'classical_theory',
          },
        });
      }
    }
  }

  // Also capture the 종합/가이드 sections and 추가자료
  const guideRegex = /\[종합 요약 및 가이드\]([\s\S]*?)(?=\[적천수:|$)/g;
  // These are already included within sections above, so skip separate capture.

  return chunks;
}

// --- 궁통보감 청킹 ---
function chunk궁통보감(text) {
  const chunks = [];

  // Split into two major parts:
  // Part 1: 오행 총론 (sections 1-6: 오행의 기원, 목, 화, 토, 금, 수)
  // Part 2: 천간별 조후 (sections 1-10: 갑목~계수)

  // Find 천간 sections by pattern like "1. 갑목", "2. 을목", etc. after the general sections
  const heavenlyStemRegex = /^(\d+)\.\s*(갑목|을목|병화|정화|무토|기토|경금|신금|임수|계수)\s*\((.+?)\)/gm;
  const stemMatches = [...text.matchAll(heavenlyStemRegex)];

  // General 오행 sections (before first 천간 section)
  const generalSectionRegex = /^(\d+)\.\s*(오행의 기원과 본성|목\(木\)의|화\(火\)의|토\(土\)의|금\(金\)의|수\(水\)의)/gm;
  const generalMatches = [...text.matchAll(generalSectionRegex)];

  // Element mapping
  const elementMap = {
    '갑목': '목', '을목': '목',
    '병화': '화', '정화': '화',
    '무토': '토', '기토': '토',
    '경금': '금', '신금': '금',
    '임수': '수', '계수': '수',
  };

  // Chunk general 오행 sections
  const allNumberedSections = text.split(/(?=^\d+\.\s)/m).filter(s => s.trim().length > 50);

  for (const section of allNumberedSections) {
    const trimmed = section.trim();
    if (trimmed.length < 50) continue;

    const firstLine = trimmed.split('\n')[0].trim();

    // Determine if it's a 천간 or general section
    const stemMatch = firstLine.match(/^\d+\.\s*(갑목|을목|병화|정화|무토|기토|경금|신금|임수|계수)/);

    if (stemMatch) {
      const stemName = stemMatch[1];
      chunks.push({
        content: trimmed,
        metadata: {
          source: '궁통보감',
          section: '월별_조후',
          heavenly_stem: stemName,
          element: elementMap[stemName] || '',
          type: 'seasonal_guidance',
        },
      });
    } else {
      // General 오행 section
      const elementMatch = firstLine.match(/(오행|목|화|토|금|수)/);
      const sectionName = firstLine.slice(0, 40);
      chunks.push({
        content: trimmed,
        metadata: {
          source: '궁통보감',
          section: sectionName,
          type: 'element_theory',
        },
      });
    }
  }

  return chunks;
}

// --- 자평진전 청킹 ---
function chunk자평진전(text) {
  const chunks = [];

  // Split by section headers: [자평진전: 섹션명]
  const sectionRegex = /\[자평진전:\s*(.+?)\]/g;
  const sectionMatches = [...text.matchAll(sectionRegex)];

  for (let i = 0; i < sectionMatches.length; i++) {
    const sectionName = sectionMatches[i][1].trim();
    const start = sectionMatches[i].index;
    const end = i + 1 < sectionMatches.length ? sectionMatches[i + 1].index : text.length;
    const sectionText = text.slice(start, end).trim();

    // Split by numbered subsections
    const subSections = sectionText.split(/(?=^\d+\.\s)/m).filter(s => s.trim().length > 50);

    if (subSections.length <= 1) {
      chunks.push({
        content: sectionText,
        metadata: {
          source: '자평진전',
          section: sectionName,
          type: 'classical_theory',
        },
      });
    } else {
      for (const sub of subSections) {
        const trimmed = sub.trim();
        if (trimmed.length < 50) continue;
        const firstLine = trimmed.split('\n')[0].trim();
        chunks.push({
          content: trimmed,
          metadata: {
            source: '자평진전',
            section: sectionName,
            subsection: firstLine.slice(0, 60),
            type: 'classical_theory',
          },
        });
      }
    }
  }

  return chunks;
}

async function ingest() {
  const dataDir = path.join(process.cwd(), 'data');

  console.log('📚 고서 텍스트 로딩 중...');

  const 적천수Text = fs.readFileSync(path.join(dataDir, '적천수.txt'), 'utf-8');
  const 궁통보감Text = fs.readFileSync(path.join(dataDir, '궁통보감.txt'), 'utf-8');
  const 자평진전Text = fs.readFileSync(path.join(dataDir, '자평진전.txt'), 'utf-8');

  console.log(`  적천수: ${적천수Text.length}자`);
  console.log(`  궁통보감: ${궁통보감Text.length}자`);
  console.log(`  자평진전: ${자평진전Text.length}자`);

  // Chunk all texts
  const allChunks = [
    ...chunk적천수(적천수Text),
    ...chunk궁통보감(궁통보감Text),
    ...chunk자평진전(자평진전Text),
  ];

  console.log(`\n✂️  총 ${allChunks.length}개 청크 생성됨`);
  for (const chunk of allChunks) {
    console.log(`  [${chunk.metadata.source}] ${chunk.metadata.section} (${chunk.content.length}자)`);
  }

  // Clear existing data
  console.log('\n🗑️  기존 데이터 삭제 중...');
  const { error: deleteError } = await supabase.from('saju_chunks').delete().neq('id', 0);
  if (deleteError) {
    console.warn('  삭제 경고 (테이블이 비어있을 수 있음):', deleteError.message);
  }

  // Embed and upload
  console.log('\n🔄 임베딩 및 업로드 시작...');
  let successCount = 0;

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    try {
      console.log(`  [${i + 1}/${allChunks.length}] 임베딩 중: ${chunk.metadata.source} - ${chunk.metadata.section}`);

      const embedding = await getEmbedding(chunk.content);

      const { error } = await supabase.from('saju_chunks').insert({
        content: chunk.content,
        embedding,
        metadata: chunk.metadata,
      });

      if (error) {
        console.error(`  ❌ 업로드 실패: ${error.message}`);
      } else {
        successCount++;
      }

      // Rate limiting: small delay between requests
      if (i < allChunks.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.error(`  ❌ 에러: ${err.message}`);
    }
  }

  console.log(`\n✅ 완료! ${successCount}/${allChunks.length}개 청크 업로드 성공`);
}

ingest().catch(console.error);
