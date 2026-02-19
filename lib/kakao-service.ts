import OpenAI from 'openai';
import { analyzeSajuStructure } from './saju-structure';
import { analyzeSajuYukchin, formatYukchinString } from './yukchin';
import { getEmbedding } from './embeddings';
import { supabase } from './supabase';
import type { Turn } from './kakao-types';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

type Gender = '남성' | '여성';

interface BirthProfile {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  gender: Gender;
}

interface SajuPillars {
  year: string;
  month: string;
  day: string;
  hour: string;
  fullString: string;
}

interface ClassicChunk {
  source: string;
  section: string;
  content: string;
  similarity: number;
}

const STEM_ALIASES: Record<string, string> = {
  갑: '갑', 을: '을', 병: '병', 정: '정', 무: '무', 기: '기', 경: '경', 신: '신', 임: '임', 계: '계',
  甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계',
};

const BRANCH_ALIASES: Record<string, string> = {
  자: '자', 축: '축', 인: '인', 묘: '묘', 진: '진', 사: '사', 오: '오', 미: '미', 신: '신', 유: '유', 술: '술', 해: '해',
  子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해',
};

function to24Hour(hour: number, meridiem?: string): number {
  if (!meridiem) return hour;
  if (meridiem === '오전') return hour === 12 ? 0 : hour;
  if (meridiem === '오후') return hour === 12 ? 12 : hour + 12;
  return hour;
}

function extractBirthProfile(text: string): Partial<BirthProfile> {
  const profile: Partial<BirthProfile> = {};
  const input = text.replace(/\s+/g, ' ').trim();

  const dateNumeric = input.match(/(19\d{2}|20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/);
  if (dateNumeric) {
    profile.year = dateNumeric[1];
    profile.month = String(Number(dateNumeric[2]));
    profile.day = String(Number(dateNumeric[3]));
  }

  const yearMatch = input.match(/(19\d{2}|20\d{2})\s*년/);
  if (yearMatch) profile.year = yearMatch[1];
  const monthMatch = input.match(/(\d{1,2})\s*월/);
  if (monthMatch) profile.month = String(Number(monthMatch[1]));
  const dayMatch = input.match(/(\d{1,2})\s*일/);
  if (dayMatch) profile.day = String(Number(dayMatch[1]));

  const timeMeridiem = input.match(/(오전|오후)\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/);
  if (timeMeridiem) {
    const h = Number(timeMeridiem[2]);
    const m = Number(timeMeridiem[3] ?? '0');
    profile.hour = String(to24Hour(h, timeMeridiem[1]));
    profile.minute = String(m);
  } else {
    const time24 = input.match(/\b(\d{1,2})\s*:\s*(\d{2})\b/);
    if (time24) {
      profile.hour = String(Number(time24[1]));
      profile.minute = String(Number(time24[2]));
    } else {
      const hourOnly = input.match(/(\d{1,2})\s*시/);
      if (hourOnly) {
        profile.hour = String(Number(hourOnly[1]));
        profile.minute = '0';
      }
    }
  }

  if (/(시간|시각|태어난 시).*(모름|몰라|기억 안)/.test(input)) {
    profile.hour = '12';
    profile.minute = '0';
  }

  if (/(여성|여자|여자입니다|female)/i.test(input)) profile.gender = '여성';
  if (/(남성|남자|남자입니다|male)/i.test(input)) profile.gender = '남성';

  return profile;
}

function mergeProfileFromHistory(history: Turn[], utterance: string): Partial<BirthProfile> {
  const merged: Partial<BirthProfile> = {};
  const userTurns = history.filter((t) => t.role === 'user').map((t) => t.content);
  const candidates = [...userTurns, utterance];

  for (const text of candidates) {
    const partial = extractBirthProfile(text);
    if (partial.year) merged.year = partial.year;
    if (partial.month) merged.month = partial.month;
    if (partial.day) merged.day = partial.day;
    if (partial.hour) merged.hour = partial.hour;
    if (partial.minute !== undefined) merged.minute = partial.minute;
    if (partial.gender) merged.gender = partial.gender;
  }

  return merged;
}

function validateProfile(input: Partial<BirthProfile>): BirthProfile | null {
  const required = ['year', 'month', 'day', 'hour', 'gender'] as const;
  for (const key of required) {
    if (!input[key]) return null;
  }

  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  const hour = Number(input.hour);
  const minute = Number(input.minute ?? '0');

  if (year < 1900 || year > 2099) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  return {
    year: String(year),
    month: String(month),
    day: String(day),
    hour: String(hour),
    minute: String(minute),
    gender: input.gender as Gender,
  };
}

function normalizePillar(rawValue: string): string {
  const cleaned = (rawValue ?? '').trim().replace(/\s+/g, '');
  if (!cleaned) return '';

  const chars = [...cleaned];
  let stem: string | null = null;
  let branch: string | null = null;

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
    throw new Error(`천간/지지 파싱 실패 (받은 값: "${rawValue}")`);
  }

  return `${stem}${branch}`;
}

async function calculateSajuFromAPI(profile: BirthProfile): Promise<SajuPillars> {
  const params = new URLSearchParams({
    y: profile.year,
    m: profile.month,
    d: profile.day,
    hh: profile.hour,
    mm: profile.minute,
    calendar: 'solar',
    gender: profile.gender === '여성' ? '여' : '남',
  });

  const response = await fetch(`https://beta-ybz6.onrender.com/api/saju?${params}`);
  if (!response.ok) {
    throw new Error('사주 계산 API 오류');
  }

  const data = await response.json();
  const year = normalizePillar(data.pillars.year);
  const month = normalizePillar(data.pillars.month);
  const day = normalizePillar(data.pillars.day);
  const hour = normalizePillar(data.pillars.hour);

  return {
    year,
    month,
    day,
    hour,
    fullString: `${year}년 ${month}월 ${day}일 ${hour}시`,
  };
}

function trimChunk(content: string, max = 380): string {
  if (content.length <= max) return content;
  return `${content.slice(0, max)}...`;
}

async function retrieveClassicChunks(query: string): Promise<ClassicChunk[]> {
  if (!supabase) return [];

  try {
    const embedding = await getEmbedding(query);
    const sources = ['자평진전', '궁통보감', '적천수'];

    const results = await Promise.all(
      sources.map((source) =>
        supabase.rpc('match_saju_chunks_by_source', {
          query_embedding: embedding,
          source_filter: source,
          match_threshold: 0.3,
          match_count: 2,
        }),
      ),
    );

    const chunks: ClassicChunk[] = [];
    results.forEach((result, index) => {
      const source = sources[index];
      if (result.error || !result.data?.length) return;
      for (const row of result.data) {
        chunks.push({
          source,
          section: row.metadata?.section || '미분류',
          content: trimChunk(row.content ?? ''),
          similarity: Number(row.similarity ?? 0),
        });
      }
    });

    return chunks;
  } catch {
    return [];
  }
}

function buildRagText(chunks: ClassicChunk[]): string {
  if (!chunks.length) return '고서 검색 결과 없음';
  return chunks
    .map((c, i) => `[${i + 1}] ${c.source} / ${c.section} / 유사도 ${(c.similarity * 100).toFixed(1)}%\n${c.content}`)
    .join('\n\n');
}

function formatHistory(history: Turn[]): string {
  const recent = history.slice(-6);
  if (!recent.length) return '없음';
  return recent
    .map((h) => `${h.role === 'user' ? '사용자' : '어시스턴트'}: ${h.content}`)
    .join('\n');
}

function needsProfileGuide(utterance: string, profile: BirthProfile | null): boolean {
  if (profile) return false;
  const sajuIntent = /(사주|운세|연애운|재물운|직업운|궁합|풀이)/.test(utterance);
  return sajuIntent || utterance.trim().length < 6;
}

export function extractAndValidateProfile(text: string): BirthProfile | null {
  const partial = extractBirthProfile(text);
  return validateProfile(partial);
}

export async function generateReply(
  utterance: string,
  history: Turn[],
  storedProfile?: BirthProfile,
): Promise<string> {
  const cleanUtterance = utterance.trim();
  if (!cleanUtterance) {
    return '사주 분석을 도와드릴게요. 생년월일시와 성별을 알려주세요. 예: 1994년 10월 3일 오후 7시 30분 여성';
  }

  if (!process.env.OPENAI_API_KEY) {
    return '현재 AI 분석 키 설정이 없어 답변을 생성할 수 없습니다. 관리자에게 OPENAI_API_KEY 설정을 요청해 주세요.';
  }

  // storedProfile이 있으면 DB에서 가져온 프로필 우선 사용
  let safeProfile: BirthProfile;

  if (storedProfile) {
    safeProfile = storedProfile;
  } else {
    const merged = mergeProfileFromHistory(history, cleanUtterance);
    const profile = validateProfile(merged);

    if (needsProfileGuide(cleanUtterance, profile)) {
      return [
        '정확한 사주 분석을 위해 아래 정보를 한 줄로 보내주세요.',
        '형식: YYYY년 M월 D일 (오전/오후) H시 M분 성별',
        '예시: 1994년 10월 3일 오후 7시 30분 여성',
        '태어난 시간을 모르면 "모름"이라고 보내주세요. (기본 12:00으로 추정 분석 가능)',
      ].join('\n');
    }

    safeProfile = profile ?? {
      year: merged.year!,
      month: merged.month!,
      day: merged.day!,
      hour: merged.hour ?? '12',
      minute: merged.minute ?? '0',
      gender: (merged.gender ?? '여성') as Gender,
    };
  }

  try {
    // 사주 API + RAG 검색 병렬 실행 (카카오 5초 타임아웃 대응)
    const questionForSearch = cleanUtterance.replace(/\s+/g, ' ').slice(0, 120);
    const preliminaryRagQuery = `사주 분석 ${questionForSearch}`;

    const [saju, preliminaryChunks] = await Promise.all([
      calculateSajuFromAPI(safeProfile),
      retrieveClassicChunks(preliminaryRagQuery),
    ]);

    const structure = analyzeSajuStructure(saju);
    const yukchin = analyzeSajuYukchin(saju);
    const yukchinText = formatYukchinString(yukchin);

    const ragText = buildRagText(preliminaryChunks);
    const prior = formatHistory(history);

    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      max_completion_tokens: 900,
      messages: [
        {
          role: 'system',
          content: `너는 사주 데이터를 내부적으로 분석한 뒤, 사용자에게 읽기 쉽고 재밌게 전달하는 AI 코치다.

[내부 분석 — 노출 금지]
사주 구조 → 고서/RAG 근거 해석 → 일상 언어로 번역. 이 과정은 사용자에게 보이지 않는다.

[금지]
- 사주 전문 용어, 고서 이름, 위치 표현(일주/시주/월지 등) 사용 금지.
- 단정적 예언 금지.

[톤]
- 친한 형/언니가 술자리에서 팩트폭격하는 느낌. 솔직하고 직설적.
- "~지?", "~거야", "~해봐", "~거든" 구어체 자연스럽게 섞어라.
- 공감은 한 문장이면 충분. 길게 위로하지 마라. 바로 핵심을 때려라.
- 약점은 쿠션 없이 솔직하게, 대신 해결책을 바로 붙여라.

[가독성 — 핵심]
- 이모지를 적극 활용해라. 문단 시작이나 핵심 포인트 앞에 이모지를 넣어 시각적 앵커를 만들어라.
- 밑줄(_중요한 부분_)이나 볼드(**핵심 키워드**)로 읽다가 눈이 멈추는 포인트를 만들어라.
- 한 문단이 3줄을 넘기지 마라. 길어지면 끊어라.
- 읽는 사람이 중간에 이탈하지 않도록 각 문단 첫 문장에 호기심을 자극하는 훅을 넣어라.`,
        },
        {
          role: 'user',
          content: `
[사용자 프로필]
생년월일시: ${safeProfile.year}년 ${safeProfile.month}월 ${safeProfile.day}일 ${safeProfile.hour}시 ${safeProfile.minute}분
성별: ${safeProfile.gender}

[사주 계산]
${saju.fullString}
일간: ${structure.dayMaster.stem} (${structure.dayMaster.element})
일간 강약: ${structure.dayMaster.strength.label} (점수 ${structure.dayMaster.strength.score})
월지/계절: ${structure.monthSupport.branch} / ${structure.monthSupport.season}

[육친]
${yukchinText}

[고서 RAG]
${ragText}

[직전 대화]
${prior}

[현재 질문]
${cleanUtterance}

[출력 규칙]
- 🎯 첫 줄: 이모지 + 한 줄 핵심 메시지 (예: "🔥 2026년, 참으면 지는 거야. 먼저 질러").
- 이후 3개 문단. 각 문단은 이모지로 시작하고 3줄 이내.
  문단1: 사용자의 성향 핵심 — 강점과 약점을 팩트로 짚어라. 공감은 한 문장이면 끝.
  문단2: 올해(또는 질문 시기) 흐름 + ⚠️ 주의할 점을 같이 묶어라. 중요한 키워드는 **볼드**로 강조.
  문단3: 🎬 구체적 실천 가이드 (기한, 빈도, 행동 포함) + 한 줄 마무리 펀치라인.
- 전체 800자 이내. 짧을수록 좋다.
          `.trim(),
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return '분석 결과를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }

    return content;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return `분석 중 오류가 발생했습니다: ${message}\n입력 형식을 확인한 뒤 다시 보내주세요.`;
  }
}
