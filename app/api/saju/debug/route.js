// 디버깅용 API - 개발 환경에서만 사용
// SECURITY: 프로덕션에서는 비활성화됨
import { supabase } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';
import { analyzeSajuYukchin, formatYukchinString } from '@/lib/yukchin';
import { analyzeSajuStructure } from '@/lib/saju-structure';

async function calculateSajuFromAPI(year, month, day, hour, minute, gender) {
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
  const data = await response.json();

  return {
    year: data.pillars.year,
    month: data.pillars.month,
    day: data.pillars.day,
    hour: data.pillars.hour,
    fullString: `${data.pillars.year}년 ${data.pillars.month}월 ${data.pillars.day}일 ${data.pillars.hour}시`,
    rawResponse: data,
  };
}

async function retrieveStageChunks(sajuInfo, question) {
  const searchQuery = `사주 ${sajuInfo.fullString} 일간 ${sajuInfo.dayMasterStem}${sajuInfo.dayMasterElement} 월지 ${sajuInfo.monthBranch}${sajuInfo.monthSeason} 강약 ${sajuInfo.dayMasterStrength} ${question}`;

  if (!supabase) {
    return {
      stage1: '',
      stage2: '',
      stage3: '',
      error: 'Supabase 미설정',
    };
  }

  const embedding = await getEmbedding(searchQuery);

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

  return {
    searchQuery,
    stage1: stage1Result.data || [],
    stage2: stage2Result.data || [],
    stage3: stage3Result.data || [],
    stage1Error: stage1Result.error,
    stage2Error: stage2Result.error,
    stage3Error: stage3Result.error,
  };
}

export async function POST(request) {
  // SECURITY: Block debug endpoint in production
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not available in production' }, { status: 404 });
  }

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

    const debugInfo = {
      step1_input: {
        birthYear,
        birthMonth,
        birthDay,
        birthHour,
        birthMinute: normalizedMinute,
        birthTime,
        meridiem,
        displayTime,
        gender,
        question,
      },
      step2_sajuCalculation: null,
      step3_structureAnalysis: null,
      step4_yukchinAnalysis: null,
      step5_ragSearch: null,
    };

    // Step 2: 사주 계산
    const saju = await calculateSajuFromAPI(birthYear, birthMonth, birthDay, birthHour, normalizedMinute, gender);
    debugInfo.step2_sajuCalculation = saju;

    // Step 3: 핵심 구조 분석
    const sajuStructure = analyzeSajuStructure(saju);
    debugInfo.step3_structureAnalysis = sajuStructure;

    // Step 4: 육친 분석
    const yukchinInfo = analyzeSajuYukchin(saju);
    const yukchinString = formatYukchinString(yukchinInfo);
    debugInfo.step4_yukchinAnalysis = {
      yukchinInfo,
      yukchinString,
    };

    // Step 5: RAG 검색
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
    debugInfo.step5_ragSearch = ragChunks;

    return Response.json({
      success: true,
      debug: debugInfo,
      message: '각 단계의 결과를 확인하세요',
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}
