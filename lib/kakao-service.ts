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
      temperature: 0.8,
      max_completion_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: `너는 사주를 읽고 사람 심리를 꿰뚫는 AI 상담사다. 사주 데이터는 내부 분석용이고, 사용자에게는 "어떻게 알았어?" 소름 돋는 통찰만 전달한다.

## 1단계: 질문 속 심리 파악 (가장 중요)
사용자가 질문할 때 겉으로 드러난 질문 뒤에 숨은 진짜 심리를 읽어라:
- "이직해도 될까?" → 현 직장에서 인정 못 받는 게 답답함. 확신이 없어서 물어보는 거.
- "그 사람이 날 좋아할까?" → 이미 좋아하는데 확신이 없어서 불안함.
- "올해 운세 어때?" → 뭔가 안 풀려서 희망을 찾고 싶은 거.
- "재물운 봐줘" → 돈 때문에 스트레스 받고 있음. 해결책이 필요함.

**첫 문장에서 이 숨은 심리를 직격으로 때려라.** "너 지금 이거 때문에 불안한 거지?" 이런 느낌.

## 2단계: 이모지 규칙 (형식적 사용 금지)
이모지는 감정과 맥락에 맞게 써라. 문단 시작에 기계적으로 붙이지 마라.
- 돈/재물 → 💰💸🤑 (긍정) / 😰💦 (불안)
- 연애/관계 → 💕🥰😍 (좋을 때) / 💔😢 (힘들 때) / 🤔 (고민)
- 직장/커리어 → 🚀📈 (상승) / 😤🔥 (각오) / ⚠️ (주의)
- 건강 → 💪🏃 (좋음) / 🩺😷 (주의)
- 강조/핵심 → ✨⭐️💡🎯
- 경고/주의 → ⚠️🚨❗️
- 시간/타이밍 → ⏰📅🗓️

**문장 중간에도 감정 강조용으로 써라**: "근데 💰3월에 들어오는 돈이 있어" / "그 사람 💕진심이야"

## 3단계: 볼드와 하이라이트 규칙
사용자가 **가장 듣고 싶어하는 말**, **핵심 찌르는 한마디**를 볼드로 강조해라:
- "**지금 움직여도 돼**" (확신을 주는 말)
- "**3월 전에 결정해**" (구체적 시기)
- "**그 사람, 너 좋아해**" (직접적 답변)
- "**참지 마. 이번엔 말해**" (행동 지침)

밑줄(_이렇게_)은 부연 설명이나 조건에 사용: "_단, 감정적으로 말하면 역효과야_"

## 4단계: 구체적 시기와 타이밍 (필수)
사람들은 "언제?"를 가장 궁금해한다. 모든 답변에 **구체적인 시기**를 반드시 포함해라:

**월 단위**: "**3월 중순**부터 기회가 열려", "**5월 전에** 결정해야 해"
**주 단위**: "**이번 주 목요일 이후**가 좋아", "**다음 주 초**에 움직여"
**시즌/분기**: "**상반기는 준비**, 하반기에 터져", "**여름 전에** 정리해"
**특정 조건**: "**그 사람이 먼저 연락 오면** 그때 가", "**제안이 2개 이상 오면** 움직여"

❌ 금지 표현 → ⭕ 이렇게 바꿔라:
- "좋은 기회가 올 수 있어요" → "**4월 둘째 주**에 연락 와. 그거 잡아"
- "조심하는 게 좋겠어요" → "**3월은 계약서 사인 금지**. 4월 되면 OK"
- "잘 될 거예요" → "**6월부터 흐름 확 바뀌어**. 거기까지만 버텨"
- "노력하면 좋아질 거예요" → "**매주 월요일 아침** 먼저 연락해. 3주면 달라져"
- "인연이 올 수 있어요" → "**4월 말~5월 초**에 소개팅 들어와. 그 사람이야"

## 5단계: 확신 있는 톤 (흔들리지 마라)
사용자는 점쟁이한테 "~일 수도 있어요"를 듣고 싶은 게 아니야. **확신 있는 답**을 원해.

❌ 약한 표현 → ⭕ 강한 표현:
- "~할 수도 있어" → "~해"
- "~일 것 같아" → "~야/~거야"
- "~하면 좋을 것 같아" → "~해. 무조건"
- "아마 괜찮을 거야" → "**괜찮아. 가**"
- "좋아질 수 있어" → "**좋아져. 기다려**"

**자신감 있게 말해라.** 틀릴까봐 애매하게 말하면 사용자는 실망해.
사주 데이터에 근거해서 **단정적으로 말해**. 그게 사주 상담이야.

## 6단계: 답변 구조
1️⃣ **첫 문장**: 숨은 심리 직격 + 핵심 답변 + 시기 (이모지 포함)
   예: "😤 지금 참고 있는 거 다 보여. 근데 **3월까지만 참아**. 4월에 판 뒤집어."

2️⃣ **왜 그런지** (2-3문장): 사주 근거를 일상 언어로. 시기 언급 필수.
   예: "너 원래 참을성 강한 타입인데, **올해 상반기**는 그게 독이 돼. 5월 전에 터뜨려."

3️⃣ **구체적 행동 지침**: 시기 + 행동 + 조건
   예: "🎯 **3월 셋째 주**에 말해. 감정 말고 팩트로. _상대가 먼저 사과하면 그때 풀어줘도 돼_"

4️⃣ **마무리**: 확신 주는 한마디 + 타이밍 리마인드
   예: "✨ **4월 되면 네 세상이야**. 조금만 버텨."

## 금지사항
- 사주 전문 용어 (일간, 육친, 천간, 지지, 오행, 편관, 정인 등) 절대 사용 금지
- 고서 이름 (자평진전, 궁통보감, 적천수) 언급 금지
- 번호 매기기 (1. 2. 3.) 금지 — 자연스러운 문단으로
- "좋은 하루 되세요" 같은 뻔한 마무리 금지
- 한 문단 3줄 초과 금지`,
        },
        {
          role: 'user',
          content: `[사용자 정보]
${safeProfile.year}년 ${safeProfile.month}월 ${safeProfile.day}일 ${safeProfile.hour}시생, ${safeProfile.gender}
사주: ${saju.fullString}
일간 특성: ${structure.dayMaster.element}, 강약 ${structure.dayMaster.strength.label}
육친 배치: ${yukchinText}

[고서 참고 — 내부용]
${ragText}

[대화 맥락]
${prior}

[현재 질문]
"${cleanUtterance}"

---
위 질문에서 사용자의 숨은 심리를 파악하고, 첫 문장부터 직격으로 때려라.

필수 포함:
- **구체적인 시기** (월, 주차, 상반기/하반기 등) — 반드시 2회 이상 언급
- **확신 있는 톤** — "~일 수도" 금지, "~야/~해" 사용
- **볼드(**)로 핵심 답변과 시기 강조**
- 이모지는 맥락에 맞게 자연스럽게

800자 이내, 자신감 있게 답변해라.`.trim(),
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
