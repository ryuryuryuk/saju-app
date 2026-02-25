import OpenAI from 'openai';
import { analyzeSajuStructure } from './saju-structure';
import { analyzeSajuYukchin, formatYukchinString } from './yukchin';
import { analyzeYearLuck, formatYearLuckText } from './saju-luck';
import { calculateSajuWithFallback } from './saju-api-fallback';
import type { Turn } from './kakao-types';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// ===== 일진 계산 (60갑자 기반) =====
const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const STEM_HANJA: Record<string, string> = {
  '갑': '甲', '을': '乙', '병': '丙', '정': '丁', '무': '戊',
  '기': '己', '경': '庚', '신': '辛', '임': '壬', '계': '癸',
};
const BRANCH_HANJA: Record<string, string> = {
  '자': '子', '축': '丑', '인': '寅', '묘': '卯', '진': '辰', '사': '巳',
  '오': '午', '미': '未', '신': '申', '유': '酉', '술': '戌', '해': '亥',
};

/**
 * 60갑자 기반 일진 계산
 * 기준일: 2026-02-23 = 무진일 (戊辰)
 */
function calculateDayPillar(year: number, month: number, day: number): { stem: string; branch: string; hanja: string } {
  const referenceDate = new Date(Date.UTC(2026, 1, 23)); // 2026-02-23
  const referenceStemIndex = 4;  // 무
  const referenceBranchIndex = 4; // 진

  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const diffTime = targetDate.getTime() - referenceDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let stemIndex = (referenceStemIndex + diffDays) % 10;
  let branchIndex = (referenceBranchIndex + diffDays) % 12;

  if (stemIndex < 0) stemIndex += 10;
  if (branchIndex < 0) branchIndex += 12;

  const stem = STEMS[stemIndex];
  const branch = BRANCHES[branchIndex];
  const hanja = `${STEM_HANJA[stem]}${BRANCH_HANJA[branch]}`;

  return { stem, branch, hanja };
}

function getSeoulDate(): { year: number; month: number; day: number; weekday: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, string> = {
    'Mon': '월', 'Tue': '화', 'Wed': '수', 'Thu': '목', 'Fri': '금', 'Sat': '토', 'Sun': '일'
  };

  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    weekday: weekdayMap[pick('weekday')] || '',
  };
}

function getTodayDayPillarInfo(): string {
  const seoul = getSeoulDate();
  const today = calculateDayPillar(seoul.year, seoul.month, seoul.day);

  // 향후 5일 일진
  const upcoming: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const futureDate = new Date(Date.UTC(seoul.year, seoul.month - 1, seoul.day + i));
    const y = futureDate.getUTCFullYear();
    const m = futureDate.getUTCMonth() + 1;
    const d = futureDate.getUTCDate();
    const pillar = calculateDayPillar(y, m, d);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const wd = weekdays[futureDate.getUTCDay()];
    upcoming.push(`${m}/${d}(${wd}): ${pillar.stem}${pillar.branch}일(${pillar.hanja}日)`);
  }

  return `오늘 ${seoul.month}월 ${seoul.day}일(${seoul.weekday})은 *${today.stem}${today.branch}일(${today.hanja}日)*이다.
향후 일진: ${upcoming.join(', ')}`;
}

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

// calculateSajuFromAPI replaced by calculateSajuWithFallback (cache + local fallback)
// Re-export for backward compatibility with kakao-handler.ts and telegram webhook
export const calculateSajuFromAPI = calculateSajuWithFallback;

// RAG (retrieveClassicChunks, buildRagText, trimChunk) removed for speed optimization

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

    const saju = await calculateSajuWithFallback(profile);

    const structure = analyzeSajuStructure(saju);
    const yukchin = analyzeSajuYukchin(saju);
    const yukchinText = formatYukchinString(yukchin);
    const todayString = getSeoulDateString();
    const todayYear = `${currentYear}년`;

    // 년운/월운 상호작용 분석
    const yearLuck = analyzeYearLuck(saju, currentYear, currentMonth);
    const yearLuckText = formatYearLuckText(yearLuck, saju.day[0]);

    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.75,
      max_completion_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `경력 20년 사주 전문가. 첫 분석이라 존댓말. 원국+년운 결합 분석.

오늘: ${todayString}. 올해=${todayYear}.

## 말투
- 존댓말 통일 (~이에요, ~거든요, ~해요). 반말/명령조 금지.
- 친근+전문적. 사주용어엔 쉬운 설명 병기: "편관(외부 압력 기운)이 올해 강해요"

## 타이틀
"🔮 *${displayName ? `${displayName}님의` : '회원님의'} ${todayYear} 운의 흐름을 분석해봤어요!*"

## 구조 (이 순서, 소제목 그대로)
1. *🧭 성향* — 일간+오행. 원국 분석.
2. *💕 사랑* — 연애 스타일 + 올해 년운 영향. 충/합 반영.
3. *🤝 인간관계* — 사회성 + 올해 변화. 년운 육친 반영.
4. *💰 재물* — 돈 관계 + 올해 흐름. 재성/식상 반영.
5. *📋 ${todayYear} 총론* — 핵심 요약.

## 핵심 규칙
- 원국+년운 구체적 작용 설명 (일반론 금지)
- 충/합/형은 해당 영역(년주=사회, 월주=직업, 일주=배우자, 시주=미래)과 연결
- *볼드* 강조. ### 마크다운 헤더 금지.
- 1500자 이내. 단정적 표현. "~할 수 있어" 금지.`,
        },
        {
          role: 'user',
          content: `${profile.year}년 ${profile.month}월 ${profile.day}일 ${profile.hour}시생, ${profile.gender}
사주: ${saju.fullString}
일간: ${structure.dayMaster.stem}(${structure.dayMaster.element}), 강약: ${structure.dayMaster.strength.label}
오행: ${JSON.stringify(structure.fiveElements)}
계절: ${structure.monthSupport.season} (${structure.monthSupport.climate})
육친: ${yukchinText}

${yearLuckText}

원국+년운 결합 분석. 타이틀→성향→사랑→인간관계→재물→총론. 1500자 이내.`.trim(),
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
    const saju = await calculateSajuWithFallback(safeProfile);

    const structure = analyzeSajuStructure(saju);
    const yukchin = analyzeSajuYukchin(saju);
    const yukchinText = formatYukchinString(yukchin);

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
      temperature: 0.8,
      max_completion_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: `경력 20년 사주 전문가. 질문 뒤 숨은 진짜 고민을 읽는 게 특기.

오늘: ${todayString}. 올해=${todayYear}.
일진: ${getTodayDayPillarInfo()}
일진 질문 시 위 정보만 사용. 절대 다른 일진 말하지 마.

## 말투
- 사용자 말투 따라감: 존댓말→존댓말, 반말→반말. 한 답변 안에서 섞지 마.
- 명령조 금지 (~다, ~냐, ~라, ~ㄴ다). 자연스럽게 (~야, ~거든, ~해, ~지).
- 친한 형/언니 톤. 전문용어 최소.

## 답변 구조
[FREE] + [PREMIUM] 태그로 나눠서 출력.

[FREE]:
1. 질문 심리 읽기 (1-2문장, 짧게)
2. 사주로 상황 분석 — 질문 카테고리별 핵심 포인트만:
   - 연애→일지/도화/관성, 재물→재성/식상/겁재, 직장→관성/인성/월주, 건강→오행균형, 시기→년월운 변화점
3. "근데..."로 끊기

[PREMIUM]:
- 결론 + 구체적 시기 + 행동 지침 step by step + 피할 것 + 플랜B
- 구체적으로: "*이번 주 금요일 저녁 7시 이후*" 수준

## 꼬리질문
이전에 같은 주제 답했으면 → 사주 기본 분석 반복 ❌ → 새로 묻는 것만 답변.

## 규칙
- 단정적. "~할 수 있어" 금지. 이모지 2-3개.
- *볼드* 강조. ### 마크다운 헤더 금지.
- GPT티 빼기. 공감 짧게.`,
        },
        {
          role: 'user',
          content: `[오늘] ${getSeoulDateString()}
[사용자] ${safeProfile.year}년 ${safeProfile.month}월 ${safeProfile.day}일 ${safeProfile.hour}시생, ${safeProfile.gender}
사주: ${saju.fullString}
일간: ${structure.dayMaster.stem}(${structure.dayMaster.element}), 강약: ${structure.dayMaster.strength.label}
오행: ${JSON.stringify(structure.fiveElements)}
육친: ${yukchinText}
${yearLuckText}

[대화 맥락]
${prior}

[질문] "${cleanUtterance}"

---
맥락 확인 후: 꼬리질문이면 새 부분만, 첫 질문이면 심리읽기→사주분석→"근데..."→PREMIUM.
[FREE]...[/FREE] [PREMIUM]...[/PREMIUM] 태그 필수.`.trim(),
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
