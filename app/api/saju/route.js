// app/api/saju/route.js
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';
import { analyzeSajuYukchin, calculateYukchin, formatYukchinString } from '@/lib/yukchin';
import { analyzeSajuStructure } from '@/lib/saju-structure';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const STEM_ALIASES = {
  갑: '갑', 을: '을', 병: '병', 정: '정', 무: '무', 기: '기', 경: '경', 신: '신', 임: '임', 계: '계',
  甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계',
};
const BRANCH_ALIASES = {
  자: '자', 축: '축', 인: '인', 묘: '묘', 진: '진', 사: '사', 오: '오', 미: '미', 신: '신', 유: '유', 술: '술', 해: '해',
  子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해',
};
const STEM_SEQUENCE = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const BRANCH_SEQUENCE = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];

/**
 * 외부 사주 API 호출
 */
async function calculateSajuFromAPI(year, month, day, hour, minute, gender) {
  try {
    const params = new URLSearchParams({
      y: year,
      m: month,
      d: day,
      hh: hour,
      mm: minute ?? '0',
      calendar: 'solar',
      gender: gender === '여성' ? '여' : '남',
    });

    const response = await fetch(`https://beta-ybz6.onrender.com/api/saju?${params}`);

    if (!response.ok) {
      throw new Error('사주 계산 API 오류');
    }

    const data = await response.json();

    return {
      year: data.pillars.year,
      month: data.pillars.month,
      day: data.pillars.day,
      hour: data.pillars.hour,
      fullString: `${data.pillars.year}년 ${data.pillars.month}월 ${data.pillars.day}일 ${data.pillars.hour}시`,
    };
  } catch (error) {
    console.error('사주 API 호출 오류:', error);
    throw new Error('사주 계산에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}

function normalizePillar(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '');
}

function parseAndNormalizePillar(rawValue) {
  const normalized = normalizePillar(rawValue);
  if (!normalized) {
    return { error: '기둥 값이 비어 있습니다.' };
  }

  const chars = [...normalized];
  let stem = null;
  let branch = null;

  for (const ch of chars) {
    if (!stem && STEM_ALIASES[ch]) {
      stem = STEM_ALIASES[ch];
      continue;
    }
    if (stem && !branch && BRANCH_ALIASES[ch]) {
      branch = BRANCH_ALIASES[ch];
      break;
    }
  }

  if (!stem || !branch) {
    return {
      error: `천간/지지 파싱 실패 (받은 값: "${rawValue}")`,
    };
  }

  return { value: `${stem}${branch}` };
}

function validateAndNormalizeSajuPillars(saju) {
  const pillarKeys = ['year', 'month', 'day', 'hour'];
  const normalized = { ...saju };

  for (const key of pillarKeys) {
    const parsed = parseAndNormalizePillar(saju[key]);
    if (parsed.error) {
      throw new Error(`사주 계산 결과 오류: ${key} 기둥 ${parsed.error}`);
    }
    normalized[key] = parsed.value;
  }

  normalized.fullString = `${normalized.year}년 ${normalized.month}월 ${normalized.day}일 ${normalized.hour}시`;
  return normalized;
}

function validateAnalysisResult(sajuStructure, yukchinInfo) {
  const hasUnknownStemElement = Object.values(sajuStructure.stemElements).some((info) => info.element === '미상');
  const hasUnknownBranchElement = Object.values(sajuStructure.branchElements).some((info) => info.element === '미상');
  const hasUnknownSeason = sajuStructure.monthSupport?.season === '미상';
  const hasUnknownYukchin = ['year', 'month', 'hour'].some((key) => yukchinInfo?.[key]?.yukchin === '미상');

  if (hasUnknownStemElement || hasUnknownBranchElement || hasUnknownSeason || hasUnknownYukchin) {
    const reasons = [];
    if (hasUnknownStemElement) reasons.push('천간 오행 매핑 실패');
    if (hasUnknownBranchElement) reasons.push('지지 오행 매핑 실패');
    if (hasUnknownSeason) reasons.push('월지 계절 매핑 실패');
    if (hasUnknownYukchin) reasons.push('육친 계산 실패');
    throw new Error(`사주 해석 실패: ${reasons.join(', ')}. 입력값 또는 외부 사주 API 응답 형식을 확인해주세요.`);
  }
}

function getCurrentYearContext() {
  const seoulYear = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()),
  );
  const seoulDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // 1984년은 갑자년
  const offset = ((seoulYear - 1984) % 60 + 60) % 60;
  const stem = STEM_SEQUENCE[offset % 10];
  const branch = BRANCH_SEQUENCE[offset % 12];

  return {
    seoulYear,
    seoulDate,
    yearStem: stem,
    yearBranch: branch,
    sexagenaryYear: `${stem}${branch}`,
  };
}

function getFixedYearTenGodContext(dayMasterStem, currentYearContext) {
  const yearStemYukchin = calculateYukchin(dayMasterStem, currentYearContext.yearStem);
  return {
    dayMasterStem,
    yearStem: currentYearContext.yearStem,
    yearBranch: currentYearContext.yearBranch,
    yearStemYukchin,
  };
}

function formatElementByPillar(elementInfo, keyName) {
  return `${elementInfo[keyName].stem}/${elementInfo[keyName].element}`;
}

function formatBranchByPillar(elementInfo, keyName) {
  return `${elementInfo[keyName].branch}/${elementInfo[keyName].element}`;
}

/**
 * RAG: 3단계 분석을 위한 고서별 검색
 * 1개의 임베딩으로 3개의 source-filtered 검색을 병렬 수행
 */
async function retrieveStageChunks(sajuInfo, question) {
  try {
    const searchQuery = `사주 ${sajuInfo.fullString} 일간 ${sajuInfo.dayMasterStem}${sajuInfo.dayMasterElement} 월지 ${sajuInfo.monthBranch}${sajuInfo.monthSeason} 강약 ${sajuInfo.dayMasterStrength} ${question}`;
    console.log('\n' + '-'.repeat(100));
    console.log('🔍 [STEP 4] RAG 고서 검색');
    console.log('-'.repeat(100));
    console.log(`   검색 쿼리: "${searchQuery}"`);

    if (!supabase) {
      console.log('⚠️  Supabase 미설정 - RAG 건너뜀');
      return { stage1: '', stage2: '', stage3: '' };
    }

    console.log('   임베딩 생성 중...');
    const embedding = await getEmbedding(searchQuery);
    console.log(`✅ 임베딩 생성 완료 (차원: ${embedding.length})`);
    console.log('   Supabase 벡터 검색 중...');

    const [stage1Result, stage2Result, stage3Result] = await Promise.all([
      supabase.rpc('match_saju_chunks_by_source', {
        query_embedding: embedding,
        source_filter: '자평진전',
        match_threshold: 0.3,
        match_count: 3,
      }),
      supabase.rpc('match_saju_chunks_by_source', {
        query_embedding: embedding,
        source_filter: '궁통보감',
        match_threshold: 0.3,
        match_count: 3,
      }),
      supabase.rpc('match_saju_chunks_by_source', {
        query_embedding: embedding,
        source_filter: '적천수',
        match_threshold: 0.3,
        match_count: 3,
      }),
    ]);

    const formatChunks = (result, label) => {
      if (result.error || !result.data?.length) {
        console.log(`   ⚠️  ${label}: 검색 결과 없음`);
        return '';
      }
      console.log(`   ✅ ${label}: ${result.data.length}건 찾음`);
      result.data.forEach((chunk, i) => {
        const section = chunk.metadata?.section || '미분류';
        const similarity = (chunk.similarity * 100).toFixed(1);
        console.log(`      [${i + 1}] ${section} (유사도: ${similarity}%)`);
      });
      return result.data
        .map((chunk, i) => {
          const section = chunk.metadata?.section || '';
          return `[${label} ${i + 1}: ${section}]\n${chunk.content}`;
        })
        .join('\n\n');
    };

    return {
      stage1: formatChunks(stage1Result, '자평진전'),
      stage2: formatChunks(stage2Result, '궁통보감'),
      stage3: formatChunks(stage3Result, '적천수'),
    };
  } catch (err) {
    console.error('RAG 검색 실패 (graceful degradation):', err.message);
    return { stage1: '', stage2: '', stage3: '' };
  }
}

export async function POST(request) {
  try {
    const {
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      birthMinute,
      birthTime,
      meridiem,
      gender,
      question,
    } = await request.json();
    const normalizedMinute = birthMinute ?? '0';
    const displayTime = birthTime && meridiem
      ? `${meridiem} ${birthTime}`
      : `${birthHour}시 ${String(normalizedMinute).padStart(2, '0')}분`;

    console.log('\n' + '='.repeat(100));
    console.log('🚀 새로운 사주 분석 요청');
    console.log('='.repeat(100));
    console.log(`📅 생년월일시: ${birthYear}년 ${birthMonth}월 ${birthDay}일 ${displayTime}`);
    console.log(`👤 성별: ${gender}`);
    console.log(`💬 질문: ${question}`);

    // 1. 외부 API로 정확한 사주 계산
    console.log('\n' + '-'.repeat(100));
    console.log('📊 [STEP 1] 사주 계산');
    console.log('-'.repeat(100));
    const rawSaju = await calculateSajuFromAPI(birthYear, birthMonth, birthDay, birthHour, normalizedMinute, gender);
    const saju = validateAndNormalizeSajuPillars(rawSaju);
    console.log('✅ 사주 계산 완료:');
    console.log(`   년주(年柱): ${saju.year}`);
    console.log(`   월주(月柱): ${saju.month}`);
    console.log(`   일주(日柱): ${saju.day} ← 일간 기준`);
    console.log(`   시주(時柱): ${saju.hour}`);
    console.log(`   전체: ${saju.fullString}`);

    // 2. 오행 구조 분석
    console.log('\n' + '-'.repeat(100));
    console.log('🌿 [STEP 2] 오행 구조 분석');
    console.log('-'.repeat(100));
    const sajuStructure = analyzeSajuStructure(saju);
    console.log(`   일간(日干): ${sajuStructure.dayMaster.stem} (${sajuStructure.dayMaster.element})`);
    console.log(`   일간 강약(추정): ${sajuStructure.dayMaster.strength.label} (점수 ${sajuStructure.dayMaster.strength.score})`);
    console.log(`   월지(月支): ${sajuStructure.monthSupport.branch} (${sajuStructure.monthSupport.element})`);
    console.log(`   월지 계절: ${sajuStructure.monthSupport.season} / ${sajuStructure.monthSupport.climate}`);

    // 3. 육친 분석
    console.log('\n' + '-'.repeat(100));
    console.log('👥 [STEP 3] 육친 분석');
    console.log('-'.repeat(100));
    const yukchinInfo = analyzeSajuYukchin(saju);
    validateAnalysisResult(sajuStructure, yukchinInfo);
    const yukchinString = formatYukchinString(yukchinInfo);
    console.log(`   일간(日干): ${yukchinInfo.ilgan} ← 나 자신`);
    console.log(`   년주 천간: ${yukchinInfo.year.stem} → 육친: ${yukchinInfo.year.yukchin}`);
    console.log(`   월주 천간: ${yukchinInfo.month.stem} → 육친: ${yukchinInfo.month.yukchin}`);
    console.log(`   일주 천간: ${yukchinInfo.day.stem} → 육친: 일간 (본인)`);
    console.log(`   시주 천간: ${yukchinInfo.hour.stem} → 육친: ${yukchinInfo.hour.yukchin}`);

    // 4. RAG: 3단계 고서별 검색
    const ragChunks = await retrieveStageChunks(
      {
        fullString: saju.fullString,
        dayMasterStem: sajuStructure.dayMaster.stem,
        dayMasterElement: sajuStructure.dayMaster.element,
        dayMasterStrength: sajuStructure.dayMaster.strength.label,
        monthBranch: sajuStructure.monthSupport.branch,
        monthSeason: sajuStructure.monthSupport.season,
      },
      question,
    );

    // 5. 단계별 RAG 컨텍스트 구성
    const stage1Section = ragChunks.stage1 ? `\n[1차 참고: 자평진전]\n${ragChunks.stage1}\n` : '';
    const stage2Section = ragChunks.stage2 ? `\n[2차 참고: 궁통보감]\n${ragChunks.stage2}\n` : '';
    const stage3Section = ragChunks.stage3 ? `\n[3차 참고: 적천수]\n${ragChunks.stage3}\n` : '';

    const stemElementSummary = `년:${formatElementByPillar(sajuStructure.stemElements, 'year')} / 월:${formatElementByPillar(sajuStructure.stemElements, 'month')} / 일:${formatElementByPillar(sajuStructure.stemElements, 'day')} / 시:${formatElementByPillar(sajuStructure.stemElements, 'hour')}`;
    const branchElementSummary = `년:${formatBranchByPillar(sajuStructure.branchElements, 'year')} / 월:${formatBranchByPillar(sajuStructure.branchElements, 'month')} / 일:${formatBranchByPillar(sajuStructure.branchElements, 'day')} / 시:${formatBranchByPillar(sajuStructure.branchElements, 'hour')}`;
    const currentYearContext = getCurrentYearContext();
    const fixedYearTenGod = getFixedYearTenGodContext(sajuStructure.dayMaster.stem, currentYearContext);

    // 6. 사용자 친화형 분석 시스템 프롬프트
    const systemPrompt = `
너는 전통 명리학을 이해하지만, 사주를 전혀 모르는 일반인이 읽어도 "와 이거 진짜 내 얘기다"라고 느끼게 만드는 심리 밀착형 사주 콘텐츠 작가다.
추상적인 해석이 아니라 행동 중심, 장면 중심, 공감 중심으로 답변한다.

[사용자 사주]
${saju.fullString}
일간: ${sajuStructure.dayMaster.stem} (${sajuStructure.dayMaster.element})
일간 강약(추정): ${sajuStructure.dayMaster.strength.label} (점수: ${sajuStructure.dayMaster.strength.score})
월지: ${sajuStructure.monthSupport.branch} (${sajuStructure.monthSupport.element})
월지 계절: ${sajuStructure.monthSupport.season} (${sajuStructure.monthSupport.climate})
천간 오행: ${stemElementSummary}
지지 오행: ${branchElementSummary}

[현재 기준 시점]
기준일(서울): ${currentYearContext.seoulDate}
올해: ${currentYearContext.seoulYear}년 (${currentYearContext.sexagenaryYear}년)

[올해 십성 고정값]
기준 일간: ${fixedYearTenGod.dayMasterStem}
올해 천간: ${fixedYearTenGod.yearStem}
올해 지지: ${fixedYearTenGod.yearBranch}
올해 천간 십성(코드 계산 고정): ${fixedYearTenGod.yearStemYukchin}

[육친 구조]
${yukchinString}

[참고 고서 맥락]
${stage1Section}
${stage2Section}
${stage3Section}

[중요 규칙]
1) 사주 용어 최소화:
- 무토, 정인격, 정재 같은 전문 용어는 가능한 쓰지 말고 생활 언어로 풀어라.
- 필요한 경우에도 한 번만 짧게 언급하고 바로 쉬운 말로 번역해라.

1-1) 연도 정확성:
- "올해/현재 흐름"은 반드시 기준일(서울) 기준으로 해석한다.
- 올해를 언급할 때는 ${currentYearContext.seoulYear}년(${currentYearContext.sexagenaryYear}년) 기준으로만 쓴다.
- 2024 갑진년은 과거 비교가 아닌 한 언급하지 않는다.

1-2) 십성 정확성:
- "올해 천간 ${fixedYearTenGod.yearStem}"의 십성은 반드시 "${fixedYearTenGod.yearStemYukchin}"으로만 해석한다.
- 절대로 다른 십성(정관/편관/정재 등)으로 바꾸지 않는다.

2) 반드시 아래 흐름을 따른다:
① 사용자 질문 공감: 사용자가 왜 이 질문을 하게 됐는지 감정부터 짚어 시작
② 사용자 성향 공감+분석: 성향을 생활 언어로 해석하고, 연애/관계 장면으로 구체화
③ 약점을 정확히 찌르는 문장 2~3개
④ 올해/지금 흐름을 짧게 설명
⑤ 실행 가능한 행동강령 2개
⑥ 한 문장 현실 조언으로 마무리

3) 행동강령 작성 규칙:
- 추상 조언 금지(예: 용기를 내라, 솔직해져라)
- 바로 실행 가능한 수치/기한/행동 단위로 써라
- 예: 연락 빈도를 하루 1회 늘려라, 썸 상태를 2주 이상 끌지 말고 확인 질문을 해라

4) 말투:
- 친근하지만 과장하지 말 것
- ${gender === '여성' ? '"언니"' : '"형"'} 호칭 사용 가능
- 타로식 신비 멘트 금지
- 현실적인 코칭 톤 유지

5) 분량:
- 너무 길지 않게, 끝까지 읽히는 밀도로 작성
- 권장 320~550자

[출력 형식 - 반드시 유지]
- 제목
- 본문
- 행동강령
- 한 줄 조언

출력 시 "제목:", "본문:", "행동강령:", "한 줄 조언:" 같은 라벨 문구는 절대 쓰지 말고 내용만 작성한다.
제목은 1줄, 본문은 단락형으로 시작하되 첫 부분에 사용자 질문 공감과 성향 분석을 반드시 포함한다.
행동강령은 번호/불릿 없이 실행 문장 정확히 2개만 자연스럽게 이어서 작성하고, 한 줄 조언은 마지막 1문장으로 마무리한다.
섹션은 줄바꿈으로만 구분한다.
    `;

    const expertSystemPrompt = `
너는 고전 명리학 연구자다. 아래 사주 정보를 바탕으로 전문 해석을 작성하라.

[목표]
- 명리학 관점의 핵심 구조를 전문적으로 해석
- 고서 맥락(자평진전/궁통보감/적천수)을 근거로 삼되 원문 인용보다 해석 중심
- 마지막에 "현대어 전달 가이드"를 포함해, 일반인에게 어떤 생활 언어로 풀어야 하는지 설명

[출력 형식]
1) 핵심 구조 진단
2) 고서 관점 요약 (자평진전/궁통보감/적천수)
3) 질문 직접 해석
4) 현대어 전달 가이드 (전문용어 -> 생활언어 변환 5개 내외)

[연도 규칙]
- 기준일(서울): ${currentYearContext.seoulDate}
- 올해: ${currentYearContext.seoulYear}년 (${currentYearContext.sexagenaryYear}년)
- "올해"를 쓸 때 위 연도 외 다른 연도를 쓰지 않는다.

[십성 고정 규칙]
- 기준 일간: ${fixedYearTenGod.dayMasterStem}
- 올해 천간 ${fixedYearTenGod.yearStem}의 십성은 "${fixedYearTenGod.yearStemYukchin}"으로 고정한다.
- 다른 십성으로 해석하지 않는다.
`;

    const expertUserMessage = `
생년월일시: ${birthYear}년 ${birthMonth}월 ${birthDay}일 ${displayTime}
성별: ${gender}
질문: ${question}

[사주 정보]
${saju.fullString}
일간: ${sajuStructure.dayMaster.stem} (${sajuStructure.dayMaster.element})
일간 강약(추정): ${sajuStructure.dayMaster.strength.label} (점수: ${sajuStructure.dayMaster.strength.score})
월지: ${sajuStructure.monthSupport.branch} (${sajuStructure.monthSupport.element})
월지 계절: ${sajuStructure.monthSupport.season} (${sajuStructure.monthSupport.climate})
천간 오행: ${stemElementSummary}
지지 오행: ${branchElementSummary}

[육친 구조]
${yukchinString}

[올해 십성 고정값]
기준 일간: ${fixedYearTenGod.dayMasterStem}
올해 천간: ${fixedYearTenGod.yearStem}
올해 지지: ${fixedYearTenGod.yearBranch}
올해 천간 십성(코드 계산): ${fixedYearTenGod.yearStemYukchin}

[참고 고서 맥락]
${stage1Section}
${stage2Section}
${stage3Section}
`;

    const userMessage = `
생년월일시: ${birthYear}년 ${birthMonth}월 ${birthDay}일 ${displayTime}
성별: ${gender}
질문: ${question}

위 사주로 질문에 답변해주세요.
    `;

    console.log('\n' + '-'.repeat(100));
    console.log('🤖 [STEP 5] GPT 전문가 풀이 생성');
    console.log('-'.repeat(100));
    console.log(`   모델: ${OPENAI_MODEL}`);
    console.log('   Temperature: 0.4');
    console.log('   Max Tokens: 1800');
    console.log('');
    console.log('   📄 전문가 풀이 입력 요약:');
    console.log(`      - 사주 정보: ${saju.fullString}`);
    console.log(`      - 일간/강약: ${sajuStructure.dayMaster.stem}(${sajuStructure.dayMaster.element}) / ${sajuStructure.dayMaster.strength.label}`);
    console.log(`      - 월지/계절: ${sajuStructure.monthSupport.branch}(${sajuStructure.monthSupport.element}) / ${sajuStructure.monthSupport.season}`);
    console.log(`      - 육친 구조: 일간=${yukchinInfo.ilgan}, 년=${yukchinInfo.year.yukchin}, 월=${yukchinInfo.month.yukchin}, 시=${yukchinInfo.hour.yukchin}`);
    console.log(`      - RAG 참고: 자평진전(${ragChunks.stage1 ? 'O' : 'X'}), 궁통보감(${ragChunks.stage2 ? 'O' : 'X'}), 적천수(${ragChunks.stage3 ? 'O' : 'X'})`);
    console.log('');
    console.log('   ⏳ OpenAI API 호출 중 (전문가 풀이)...');

    const expertResponse = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1800,
      temperature: 0.4,
      messages: [
        { role: 'system', content: expertSystemPrompt },
        { role: 'user', content: expertUserMessage },
      ],
    });

    const expertAnalysis = expertResponse.choices?.[0]?.message?.content?.trim() || '';
    if (!expertAnalysis) {
      throw new Error('OpenAI 전문가 풀이 응답이 비어 있습니다.');
    }

    console.log('   ✅ 전문가 풀이 생성 완료');
    console.log('   📘 내부 전문가 풀이 로그 시작');
    console.log('-'.repeat(100));
    console.log(expertAnalysis);
    console.log('-'.repeat(100));
    console.log('   📘 내부 전문가 풀이 로그 끝');
    console.log('');

    console.log('\n' + '-'.repeat(100));
    console.log('🤖 [STEP 6] GPT 사용자 답변 생성');
    console.log('-'.repeat(100));
    console.log(`   모델: ${OPENAI_MODEL}`);
    console.log('   Temperature: 0.7');
    console.log('   Max Tokens: 1500');
    console.log('');
    console.log('   ⏳ OpenAI API 호출 중 (사용자 답변)...');

    // 8. OpenAI API 호출 (사용자용 답변)
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1500,
      temperature: 0.7,
      messages: [
        { role: 'system', content: `${systemPrompt}\n\n[내부 참고 전문 풀이]\n${expertAnalysis}` },
        { role: 'user', content: userMessage },
      ],
    });

    const aiResult = response.choices?.[0]?.message?.content?.trim() || '';
    if (!aiResult) {
      throw new Error('OpenAI 응답이 비어 있습니다.');
    }

    const expertPromptTokens = expertResponse.usage?.prompt_tokens ?? 0;
    const expertCompletionTokens = expertResponse.usage?.completion_tokens ?? 0;
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;
    const totalInputTokens = expertPromptTokens + promptTokens;
    const totalOutputTokens = expertCompletionTokens + completionTokens;

    console.log('   ✅ GPT 사용자 답변 완료');
    console.log(`      전문가 풀이 토큰: in=${expertPromptTokens}, out=${expertCompletionTokens}`);
    console.log(`      사용자 답변 토큰: in=${promptTokens}, out=${completionTokens}`);
    console.log(`      총 토큰: in=${totalInputTokens}, out=${totalOutputTokens}, total=${totalInputTokens + totalOutputTokens}`);
    console.log('');
    console.log('   📝 AI 답변 (처음 200자):');
    console.log(`      ${aiResult.substring(0, 200)}...`);
    console.log('');

    // 9. 응답 반환
    console.log('='.repeat(100));
    console.log('✅ 사주 분석 완료 - 클라이언트로 응답 전송');
    console.log('='.repeat(100) + '\n');

    return Response.json({
      success: true,
      result: aiResult,
      sajuInfo: {
        fullString: saju.fullString,
        dayMaster: {
          stem: sajuStructure.dayMaster.stem,
          element: sajuStructure.dayMaster.element,
          strength: sajuStructure.dayMaster.strength,
        },
        monthSupport: sajuStructure.monthSupport,
        stemElements: sajuStructure.stemElements,
        branchElements: sajuStructure.branchElements,
      },
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    });
  } catch (error) {
    console.error('\n' + '='.repeat(100));
    console.error('❌ 오류 발생');
    console.error('='.repeat(100));
    console.error(error);
    console.error('='.repeat(100) + '\n');
    return Response.json(
      {
        success: false,
        error: error.message || '사주 분석 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
