import OpenAI from 'openai';
import { analyzeSajuStructure } from './saju-structure';
import { analyzeSajuYukchin, formatYukchinString } from './yukchin';
import { analyzeYearLuck, formatYearLuckText } from './saju-luck';
import { getEmbedding } from './embeddings';
import { supabase } from './supabase';
import type { Turn } from './kakao-types';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

// 메시지 유형 분류
type MessageType = 'saju_question' | 'casual_chat' | 'meta_question' | 'harmful_request' | 'greeting';

function classifyMessage(text: string): MessageType {
  const lower = text.toLowerCase().trim();

  // 1. 위험/유해 요청 감지
  const harmfulPatterns = [
    /자살|자해|죽고\s?싶|죽는\s?방법|목숨|극단적/,
    /마약|필로폰|대마|코카인|약물/,
    /폭발물|폭탄|총기|살인|살해/,
    /해킹|계좌\s?털기|보이스\s?피싱/,
  ];
  if (harmfulPatterns.some(p => p.test(text))) {
    return 'harmful_request';
  }

  // 2. 메타 질문 (AI/분석 자체에 대한 질문)
  const metaPatterns = [
    /왜\s*(이렇게|그렇게)\s*(분석|말|얘기|대답)/,
    /어떻게\s*알아|어떻게\s*분석/,
    /뭘\s*보고\s*(판단|분석)/,
    /네가\s*(뭔데|누군데|어떻게)/,
    /ai\s*(맞|아니|인가)/i,
    /gpt\s*(맞|아니|인가)/i,
    /사람이야|로봇이야|봇이야/,
    /근거가\s*뭐|출처가\s*뭐/,
  ];
  if (metaPatterns.some(p => p.test(text))) {
    return 'meta_question';
  }

  // 3. 인사/가벼운 대화
  const greetingPatterns = [
    /^(안녕|하이|헬로|ㅎㅇ|hi|hello)/i,
    /^(반가워|만나서\s*반가)/,
    /^(잘\s*있어|잘\s*지내)/,
  ];
  if (greetingPatterns.some(p => p.test(text))) {
    return 'greeting';
  }

  // 4. 캐주얼/무의미 메시지
  const casualPatterns = [
    /^[ㅋㅎㅠㅜㄷㄱㅂㅅㅈ]+$/,  // ㅋㅋㅋ, ㅎㅎㅎ 등
    /^[ㅋㅎ]{2,}$/,
    /^(ㅇㅋ|ㅇㅇ|ㄴㄴ|ㄱㄱ|ㅇㅎ|ㅂㅂ)$/,
    /^(오키|오케이|ㅇㅋㅇㅋ|굿|좋아|알겠어|그래|응|어|음|헐|와|대박|실화|ㄹㅇ|진짜|레알)/,
    /^\.+$/,
    /^\?+$/,
    /^!+$/,
    /^(뭐|뭔|모야|뭐야)\??$/,
    /^테스트/,
  ];
  if (casualPatterns.some(p => p.test(lower)) || text.length <= 3) {
    // 짧은 메시지 중 사주 키워드가 있으면 사주 질문으로
    const sajuKeywords = /운세|사주|궁합|재물|연애|취업|이직|결혼|건강|운|올해|내년|이번\s*달/;
    if (sajuKeywords.test(text)) {
      return 'saju_question';
    }
    return 'casual_chat';
  }

  // 5. 기본값: 사주 관련 질문
  return 'saju_question';
}

// 비사주 메시지에 대한 응답 생성
async function generateNonSajuReply(
  messageType: MessageType,
  utterance: string,
  history: Turn[],
): Promise<string> {
  // 유해 요청
  if (messageType === 'harmful_request') {
    return '그런 이야기는 내가 도와줄 수 없어. 혹시 힘든 일 있어? 전문 상담이 필요하면 자살예방상담전화 1393, 정신건강위기상담전화 1577-0199로 연락해봐. 💙';
  }

  // 메타 질문
  if (messageType === 'meta_question') {
    const metaPrompt = `사용자가 AI/분석 방식에 대해 물었어. 짧고 자연스럽게 대답해.
- "나는 사주 전문가 AI야" 라고 솔직히
- 사주 분석은 사주팔자 + 고서 지식 기반이라고 간단히
- 궁금한 거 있으면 사주 관련해서 편하게 물어보라고
- 3문장 이내, 친근하게

사용자: "${utterance}"`;

    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      max_completion_tokens: 200,
      messages: [{ role: 'user', content: metaPrompt }],
    });
    return response.choices?.[0]?.message?.content?.trim() ?? '나는 사주 분석 AI야. 사주 관련해서 궁금한 거 물어봐!';
  }

  // 인사
  if (messageType === 'greeting') {
    const greetings = [
      '안녕! 사주 봐줄까? 생년월일시 알려줘 😊',
      '반가워! 오늘 운세나 궁금한 거 있어?',
      '안녕~ 사주 상담 원하면 생년월일시랑 성별 알려줘!',
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // 캐주얼 대화
  if (messageType === 'casual_chat') {
    const recentContext = history.slice(-3).map(t => t.content).join(' ');
    const hasSajuContext = /운세|사주|재물|연애|취업|결혼/.test(recentContext);

    if (hasSajuContext) {
      return 'ㅋㅋ 더 궁금한 거 있어? 아니면 다른 주제로 사주 봐줄까?';
    }
    return '뭔가 궁금한 거 있어? 사주 관련이면 편하게 물어봐!';
  }

  return '사주 관련해서 궁금한 거 있으면 물어봐!';
}

type Gender = '남성' | '여성';

// 오행 시각화 차트 생성
interface FiveElements {
  목: number;
  화: number;
  토: number;
  금: number;
  수: number;
}

function buildFiveElementsChart(elements: FiveElements, saju: string): string {
  const elementData = [
    { name: '목', emoji: '🌳', value: elements.목, desc: 'Wood' },
    { name: '화', emoji: '🔥', value: elements.화, desc: 'Fire' },
    { name: '토', emoji: '🏔️', value: elements.토, desc: 'Earth' },
    { name: '금', emoji: '⚔️', value: elements.금, desc: 'Metal' },
    { name: '수', emoji: '💧', value: elements.수, desc: 'Water' },
  ];

  const maxValue = 8; // 총 8글자 (천간4 + 지지4)
  const barLength = 8;

  const bars = elementData.map(({ name, emoji, value }) => {
    const filled = Math.round((value / maxValue) * barLength);
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${emoji} ${name} ${bar} ${value}`;
  });

  return `*📊 오행 분포*\n\`\`\`\n${bars.join('\n')}\n\`\`\`\n사주: ${saju}\n`;
}

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

function getSeoulDateString(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
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

export async function generateFirstReading(profile: BirthProfile, displayName?: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return '현재 AI 분석 키 설정이 없어 답변을 생성할 수 없습니다.';
  }

  try {
    const now = new Date();
    const seoulNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const currentYear = seoulNow.getFullYear();
    const currentMonth = seoulNow.getMonth() + 1;

    // 년운 키워드를 RAG 쿼리에 포함
    const ragQuery = `사주 종합 분석 성격 연애 재물 년운 대운 오행 생극 충합`;
    const [saju, chunks] = await Promise.all([
      calculateSajuFromAPI(profile),
      retrieveClassicChunks(ragQuery),
    ]);

    const structure = analyzeSajuStructure(saju);
    const yukchin = analyzeSajuYukchin(saju);
    const yukchinText = formatYukchinString(yukchin);
    const ragText = buildRagText(chunks);
    const todayString = getSeoulDateString();
    const todayYear = `${currentYear}년`;

    // 년운/월운 상호작용 분석
    const yearLuck = analyzeYearLuck(saju, currentYear, currentMonth);
    const yearLuckText = formatYearLuckText(yearLuck, saju.day[0]);

    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.75,
      max_completion_tokens: 3500,
      messages: [
        {
          role: 'system',
          content: `너는 경력 20년 사주 전문가야. 첫 만남에서 사용자의 사주를 구조적으로 분석해주는 역할이야.
이건 무료 첫 분석이고, 사용자가 "와 이 사람 진짜 전문가다" 하면서 신뢰하게 만들어야 해.

## 현재 날짜
오늘은 ${todayString}이다. 현재 연도는 ${todayYear}이다.

## ⚠️ 핵심: 년운 반영 (가장 중요한 분석 포인트)
아래 [년운 분석 데이터]를 반드시 각 카테고리에 녹여서 풀이해라.
단순히 "올해는 이런 해" 같은 일반론이 아니라, 사용자 원국(타고난 사주)과 올해 년운이 만나서
*구체적으로 어떤 작용*이 일어나는지를 풀어야 한다.

예시 (이런 수준의 구체성 필요):
- "일간이 경금(金)인데 올해 병화(火)가 들어오면, 편관이 작용해요. 외부에서 압박이 오거나 갑자기 책임질 일이 생기는 구조예요."
- "원국 시지에 자(子)가 있는데 년운 오(午)와 충이 걸려요. 시주는 자녀·미래·말년을 의미하니까, 올해 미래 계획이 한번 크게 흔들릴 수 있어요."
- "년운 오미합(午未合)이 걸리면서 토 기운이 강해지는데, 이게 사주에서 재성이라 올해 재물 기회가 자연스럽게 열려요."

일반론 금지. "올해 변화가 많아요" 같은 누구에게나 해당되는 말은 실패.

## ⚠️ 말투
- 첫 분석은 **존댓말**로. 첫 만남이니까 예의 있게, 부드럽지만 전문적으로.
- **말투 일관성 필수**: 처음부터 끝까지 존댓말. 한 문장도 반말로 끝내지 마.
  - ⭕ "~이에요", "~거든요", "~해요", "~인데요", "~드릴게요"
  - ❌ "~야", "~거든", "~해", "~이야"
- 문장 흐름이 매끄럽게 이어져야 해요. 끊기면 실패.
- 사주 용어를 *조금씩* 섞되, 반드시 쉬운 설명을 바로 옆에 붙여:
  - "편관(외부 압력을 뜻하는 기운)이 올해 강하게 들어오거든요"
  - "재성(재물의 기운)이 활성화되는 구조예요"

## ⚠️ 타이틀 (맨 처음에 반드시)
메시지 맨 위에 아래 형식으로 타이틀을 달아:
"🔮 *${displayName ? `${displayName}님의` : '회원님의'} ${todayYear} 전반적인 운의 흐름을 분석해봤어요!*"

## 분석 구조 (이 순서, 이 소제목 그대로)
1. *🧭 사주로 풀이한 성향* — 일간 특성 + 오행 균형. "이게 나야" 느낌. 타고난 원국 분석.
2. *💕 사랑* — 연애 스타일 + *올해 년운이 연애에 미치는 영향*. 충/합이 있으면 반드시 반영.
3. *🤝 인간관계* — 사회적 성향 + *올해 인간관계에서 달라지는 것*. 년운 육친 작용 반영.
4. *💰 재물* — 돈과의 관계 + *올해 재물운 흐름*. 재성/식상 년운 작용 반영.
5. *📋 ${todayYear} 총론* — 올해 핵심 흐름 요약. 년운과 원국의 상호작용을 종합. 월운도 간단히 언급.

각 카테고리에서 "올해는~" 으로 시작하는 시기 반영 문장이 최소 1-2개 있어야 함.

## 분석 깊이
- 원국(타고난 사주) 분석 + 년운(올해 흐름) 분석을 반드시 결합.
- 충/합/형이 있으면 해당 기둥이 의미하는 영역(년주=조상/사회, 월주=부모/직업, 일주=배우자/나, 시주=자녀/미래)과 연결해서 풀이.
- 년운 육친(편관/정재/식신 등)이 올해 어떤 에너지를 가져오는지 구체적으로 설명.
- 고서 내용은 네 말로 자연스럽게 녹여서 풀이. 고서 제목 언급 금지.

## GPT 티 빼기
"~할 수 있어", "~라고 볼 수 있어" 금지. 단정적으로.

## 포맷
- *볼드*로 핵심 포인트 강조 (Telegram: *텍스트*)
- 카테고리 사이 줄바꿈
- 전체 1800자 이내
- ⚠️ ### 이나 ## 마크다운 헤더 절대 금지. 소제목은 *볼드*만.

## 오행 이모지 (반드시 적용)
오행을 언급할 때 해당 이모지를 앞에 붙여:
- 목(木) → 🌳목
- 화(火) → 🔥화
- 토(土) → 🏔️토
- 금(金) → ⚔️금
- 수(水) → 💧수
예시: "일간이 🔥화 기운이라 열정적이에요", "🌳목이 강해서 추진력이 있어요"

## 금지
- "~일 수도", "~할 수 있어" 같은 불확실 표현
- 과한 공감/애교
- 고서 제목 직접 언급
- ### ## 마크다운 헤더
- 누구에게나 해당되는 일반론`,
        },
        {
          role: 'user',
          content: `[사용자 원국 정보]
${profile.year}년 ${profile.month}월 ${profile.day}일 ${profile.hour}시생, ${profile.gender}
사주: ${saju.fullString}
일간: ${structure.dayMaster.stem}(${structure.dayMaster.element}), 강약: ${structure.dayMaster.strength.label} (점수: ${structure.dayMaster.strength.score})
오행 분포: ${JSON.stringify(structure.fiveElements)}
월지 계절: ${structure.monthSupport.season} (${structure.monthSupport.climate})
육친 배치: ${yukchinText}

${yearLuckText}

[고서 참고 — 내부용, 절대 제목 언급 금지]
${ragText}

---
이 사람의 사주를 원국 + 년운 결합해서 구조적으로 분석해줘.
타이틀 → 성향 → 사랑 → 인간관계 → 재물 → 총론 순서.
각 카테고리마다 (1) 원국 기반 분석 + (2) 올해 년운이 미치는 영향을 둘 다 포함해.
충/합/형이 있으면 반드시 해당 영역과 연결해서 풀어.
전문용어 살짝 + 바로 쉬운 설명. 1800자 이내.`.trim(),
        },
      ],
    });

    const llmResponse = response.choices?.[0]?.message?.content?.trim() ?? '분석 결과를 생성하지 못했습니다.';

    // 오행 차트를 LLM 응답 앞에 추가
    const chart = buildFiveElementsChart(structure.fiveElements as FiveElements, saju.fullString);
    return `${chart}\n${llmResponse}`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return `분석 중 오류가 발생했습니다: ${message}`;
  }
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

  // 메시지 유형 분류 — 사주 질문이 아니면 다르게 응답
  const messageType = classifyMessage(cleanUtterance);
  if (messageType !== 'saju_question') {
    return generateNonSajuReply(messageType, cleanUtterance, history);
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

    const todayString = getSeoulDateString();
    const now = new Date();
    const seoulNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const todayYear = `${seoulNow.getFullYear()}년`;

    // 년운/월운 분석
    const yearLuck = analyzeYearLuck(saju, seoulNow.getFullYear(), seoulNow.getMonth() + 1);
    const yearLuckText = formatYearLuckText(yearLuck, saju.day[0]);

    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.75,
      max_completion_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: `너는 경력 20년 사주 전문가야. 짧고 강하게. 한 문장도 허투루 쓰지 마.

## ⚠️ 현재 날짜 (최우선 규칙)
오늘은 ${todayString}이다. 현재 연도는 ${todayYear}이다.
- "올해" = ${todayYear}. 절대로 2024년이나 2025년이 아니다.
- "이번 달" = 이 날짜의 월이다.

## ⚠️ 말투 (가장 중요 — 서비스 퀄리티의 핵심)
- 사용자의 말투를 반드시 따라가라:
  - 사용자가 "~요", "~해요", "~인가요?" → 너도 존댓말로 통일: "~해요", "~거든요", "~이에요"
  - 사용자가 "~해", "~야", "~인데" → 너도 반말로 통일: "~해", "~거든", "~이야"
- **말투 일관성 필수**: 한 답변 안에서 반말/존댓말 절대 섞지 마.
  - ❌ "네 사주를 보면 감정이 강한 타입이야. 이런 부분은 조심하셔야 해요." (반말+존댓말 혼용)
  - ⭕ 반말: "네 사주를 보면 감정이 강한 타입이야. 이런 부분은 조심해야 해."
  - ⭕ 존댓말: "사주를 보니까요, 감정이 강한 타입이에요. 이런 부분은 조심하셔야 해요."
- 문장 흐름이 매끄러워야 해. 읽다가 뚝뚝 끊기면 실패. 자연스럽게 이어지도록.
- 사용자의 톤과 에너지를 미러링해서 친근감을 줘라. 맞춤형 서비스니까.
- 설명은 쉽게. 전문용어 쓰지 마.

## ⚠️ 답변 구조 (반드시 지켜라 — 전환율이 여기서 갈린다)
답변을 [FREE]와 [PREMIUM] 두 섹션으로 나눠서 작성해라.

[FREE] — 사용자를 홀리는 파트
- 사주가 정확히 맞다는 걸 보여줘. "와 소름" 반응 끌어내기.
- 이 사람이 평소에 이런 성향이지? 하면서 구체적으로 찔러.
- 흐름이나 기운은 읽어주되, 핵심 답변(시기, 결론)은 절대 여기서 안 줌.
- 마지막에 "근데..." 하면서 핵심이 있다는 걸 암시하고 끊어.

[PREMIUM] — 사용자가 진짜 원하는 답
- 구체적 시기/타이밍 ("*3월 둘째주*", "*이번 주 목요일 전*")
- 해도 되는지/하면 안 되는지 결론
- 지금 당장 해야 할 행동 1가지
- 피해야 할 것, 조심할 것
- "이 시기 놓치면..." 하면서 긴박감

핵심: FREE에서 정확도로 신뢰를 쌓고, PREMIUM에서 "이거 안 보면 찜찜하겠다" 만들어라.

예시:
[FREE]네 사주 보니까 원래 결정 앞에서 오래 고민하는 타입이야. 특히 돈 관련해서는 더 그렇고. 근데 지금 흐름이 좀 독특해...[/FREE]
[PREMIUM]솔직히 말하면, *이번 달 안에* 움직여야 해. 다음 달 넘어가면 기운이 꺾여. 구체적으로 *23일 전*에 결정 내려. 그리고 지금 고민하는 그 금액, 줄여서 가. 욕심내면 다 잃어.[/PREMIUM]

반드시 [FREE] 태그와 [PREMIUM] 태그로 감싸서 출력해라.

## 고서 활용
고서 내용을 네 말로 자연스럽게 녹여서 풀이. 인용이나 고서 제목 금지.

## GPT 티 빼기
- "~할 수 있어", "~라고 볼 수 있어" 금지
- "근데 이게", "솔직히", "사실" 같은 자연스러운 연결어
- 문장 길이 다양하게

## 공감은 짧게
- "고민되지" 한마디면 끝. 바로 본론.

## 이모지
- 일반 이모지: 2-3개. 포인트에만. 💪💰💕
- 오행 이모지 (반드시 적용): 오행 언급 시 이모지 붙여
  - 🌳목, 🔥화, 🏔️토, ⚔️금, 💧수
  - 예: "🔥화 기운이 강해서", "🌳목이 부족한 편이야"

## 날짜/시기
- 시기를 물어봤으면 현재 날짜 기준으로 구체적으로. "*3월 중순*", "*이번 주 후반*"
- 시기를 안 물어봤으면 굳이 시기를 끼워넣지 마.

## 텔레그램 포맷팅
- *볼드*: 핵심, 시기
- _이탤릭_: 조건, 주의

## 금지
- 사주 전문용어, GPT스러운 정형화된 문장, 과한 공감/애교`,
        },
        {
          role: 'user',
          content: `[오늘 날짜] ${getSeoulDateString()}

[사용자 정보]
${safeProfile.year}년 ${safeProfile.month}월 ${safeProfile.day}일 ${safeProfile.hour}시생, ${safeProfile.gender}
사주: ${saju.fullString}
일간 특성: ${structure.dayMaster.stem}(${structure.dayMaster.element}), 강약 ${structure.dayMaster.strength.label}
오행 분포: ${JSON.stringify(structure.fiveElements)}
육친 배치: ${yukchinText}

${yearLuckText}

[고서 참고 — 내부용]
${ragText}

[대화 맥락]
${prior}

[현재 질문]
"${cleanUtterance}"

---
전문가로서 권위 있게, 근데 말은 편하게 답변해.
반드시 [FREE]...[/FREE] 와 [PREMIUM]...[/PREMIUM] 태그로 나눠서 써.
FREE는 감탄하게, PREMIUM은 핵심 답변.
800자 이내.`.trim(),
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
