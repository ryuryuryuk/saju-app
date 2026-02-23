import OpenAI from 'openai';
import { getProfile } from '@/lib/user-profile';
import { getUserTopInterests } from '@/lib/interest-helpers';
import type { InterestCategory } from '@/lib/interest-analyzer';
import {
  CATEGORY_EMOJI,
  DAILY_BUTTONS,
  DAILY_PUSH_SYSTEM_PROMPT,
  FULL_DAILY_SYSTEM_PROMPT,
  HINT_DAILY_SYSTEM_PROMPT,
  getWeekdayBaseCategories,
  mapInterestToDailyCategory,
  type DailyMessageCategory,
} from '@/lib/daily_message_templates';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

type BirthProfile = {
  birth_year: number;
  birth_month: number;
  birth_day: number;
  birth_hour: number;
  birth_minute: number;
  gender: '남성' | '여성';
};

export interface DailyMessageResult {
  text: string;
  category: string;
  persona: string | null;
  buttons: { text: string; callback_data: string }[];
}

function getSeoulNow(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const iso = `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}+09:00`;
  return new Date(iso);
}

function formatSeoulDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function resolveDailyCategories(
  weekday: number,
  topInterests: { category: InterestCategory; score: number }[],
): DailyMessageCategory[] {
  const base = getWeekdayBaseCategories(weekday);
  const top1 = topInterests[0] ? mapInterestToDailyCategory(topInterests[0].category) : null;

  if (!top1) return base;
  if (base.includes(top1)) return base;

  return [top1, ...base].slice(0, 2);
}

function getPersona(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object') return null;
  const raw = (profile as { persona?: string; assigned_shin?: string }).persona
    ?? (profile as { assigned_shin?: string }).assigned_shin;
  if (!raw) return null;
  return String(raw).trim() || null;
}

interface UserSajuResult {
  fullString: string;
  dayStem: string;  // 사용자 일간
}

async function calculateSajuPillars(profile: BirthProfile): Promise<UserSajuResult> {
  const params = new URLSearchParams({
    y: String(profile.birth_year),
    m: String(profile.birth_month),
    d: String(profile.birth_day),
    hh: String(profile.birth_hour),
    mm: String(profile.birth_minute),
    calendar: 'solar',
    gender: profile.gender === '여성' ? '여' : '남',
  });

  const response = await fetch(`https://beta-ybz6.onrender.com/api/saju?${params}`);
  if (!response.ok) {
    throw new Error('사주 원국 계산 실패');
  }

  const data = await response.json();
  const dayPillar = data.pillars.day;

  return {
    fullString: `${data.pillars.year}년 ${data.pillars.month}월 ${data.pillars.day}일 ${data.pillars.hour}시`,
    dayStem: dayPillar[0],
  };
}

interface TodayGanjiResult {
  dayPillar: string;       // 예: "무진"
  dayStem: string;         // 천간: "무"
  dayBranch: string;       // 지지: "진"
  dayStemElement: string;  // 천간 오행: "토"
}

const STEM_ELEMENTS: Record<string, string> = {
  '갑': '목', '을': '목', '병': '화', '정': '화', '무': '토',
  '기': '토', '경': '금', '신': '금', '임': '수', '계': '수',
};

// 천간 (10개)
const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
// 지지 (12개)
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];

/**
 * 60갑자 기반 일진 계산 (직접 구현)
 * 기준일: 2026-02-23 = 무진일 (戊辰)
 * - 무(戊) = 천간 index 4
 * - 진(辰) = 지지 index 4
 */
function calculateDayPillar(year: number, month: number, day: number): { stem: string; branch: string } {
  // 기준일: 2026년 2월 23일 = 무진일
  const referenceDate = new Date(Date.UTC(2026, 1, 23)); // 월은 0-indexed
  const referenceStemIndex = 4;  // 무
  const referenceBranchIndex = 4; // 진

  // 계산할 날짜
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  // 일수 차이 계산
  const diffTime = targetDate.getTime() - referenceDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // 천간은 10일 주기, 지지는 12일 주기
  let stemIndex = (referenceStemIndex + diffDays) % 10;
  let branchIndex = (referenceBranchIndex + diffDays) % 12;

  // 음수 처리
  if (stemIndex < 0) stemIndex += 10;
  if (branchIndex < 0) branchIndex += 12;

  return {
    stem: STEMS[stemIndex],
    branch: BRANCHES[branchIndex],
  };
}

function getTodayGanji(): TodayGanjiResult {
  // 서울 시간 기준 날짜 추출
  const now = new Date();
  const seoulParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const pick = (type: string) => seoulParts.find((p) => p.type === type)?.value ?? '01';
  const seoulYear = Number(pick('year'));
  const seoulMonth = Number(pick('month'));
  const seoulDay = Number(pick('day'));

  // 직접 계산
  const { stem: dayStem, branch: dayBranch } = calculateDayPillar(seoulYear, seoulMonth, seoulDay);
  const dayPillar = `${dayStem}${dayBranch}`;

  return {
    dayPillar,
    dayStem,
    dayBranch,
    dayStemElement: STEM_ELEMENTS[dayStem] || '',
  };
}

function analyzeDayInteraction(userDayStem: string, todayDayStem: string): string {
  const userElement = STEM_ELEMENTS[userDayStem];
  const todayElement = STEM_ELEMENTS[todayDayStem];

  if (!userElement || !todayElement) return '특별한 상호작용 없음';

  const generates: Record<string, string> = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
  const controls: Record<string, string> = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };

  if (userElement === todayElement) {
    return `비겁(比劫) — 오늘 기운이 너랑 비슷해. 경쟁자가 나타나거나 내 페이스가 강해지는 날`;
  }
  if (generates[userElement] === todayElement) {
    return `식상(食傷) — 네가 에너지를 발산하는 날. 표현력 UP, 창작/소통에 유리`;
  }
  if (generates[todayElement] === userElement) {
    return `인성(印星) — 도움 받는 날. 어른/선배/멘토 찾아가면 좋아`;
  }
  if (controls[userElement] === todayElement) {
    return `재성(財星) — 돈/이성 기회가 오는 날. 근데 과욕은 금물`;
  }
  if (controls[todayElement] === userElement) {
    return `관성(官星) — 외부 압박이 올 수 있어. 조심스럽게 움직여`;
  }

  return '특별한 충돌 없이 무난한 날';
}

function buildFallbackMessage(categories: DailyMessageCategory[], persona: string | null): string {
  const primary = categories[0] || 'general';
  const emoji = CATEGORY_EMOJI[primary] || '✨';
  const tone = persona ? `${persona}의 촉으로 보면` : '오늘 흐름을 보면';
  const text = `${emoji} 오늘의 3대 키워드: *집중* *타이밍* *선택*

${tone}, 오늘 ██시~██시 사이가 황금 시간대야.
████ 방향으로 움직이면 좋고, ████색 포인트로.

점심 전에 ████ 해두면 저녁에 결과가 와.
근데 ████한 사람은 오늘 피해.

이 신호, 먼저 읽어낼 준비됐어?`;
  return text.slice(0, 400);
}

function enforceMessageRules(raw: string, categories: DailyMessageCategory[]): string {
  let text = raw.trim();
  if (!text) return buildFallbackMessage(categories, null);

  const lines = text.split('\n').filter(Boolean);
  const primary = categories[0] || 'general';
  const emoji = CATEGORY_EMOJI[primary] || '✨';

  // 첫 줄에 이모지 추가
  if (!lines[0].includes(emoji) && !lines[0].match(/^[🌟✨💸💘💼🩺⚠️🧭📅🤝📚]/)) {
    lines[0] = `${emoji} ${lines[0].replace(/^[-*•\s]+/, '')}`;
  }

  text = lines.join('\n');

  // 블랭크가 없으면 추가
  const blankCount = (text.match(/████/g) || []).length;
  if (blankCount < 2) {
    text = `${text}\n오늘의 핵심 타이밍은 ██시, ████ 방향이야.`;
  }

  // 질문으로 안 끝나면 추가
  if (!text.includes('?')) {
    text = `${text}\n이 신호, 먼저 읽어낼 수 있을까?`;
  }

  // 400자 제한
  if (text.length > 400) {
    text = text.slice(0, 400).trim();
  }

  return text;
}

export async function get_user_top_interests(user_id: number) {
  return getUserTopInterests('telegram', String(user_id), 2);
}

export async function generateDailyMessage(userId: number): Promise<DailyMessageResult> {
  const profile = await getProfile('telegram', String(userId));
  const topInterests = await get_user_top_interests(userId);
  const now = getSeoulNow();
  const weekday = now.getUTCDay();
  const categories = resolveDailyCategories(weekday, topInterests);
  const primaryCategory = categories[0] || 'general';

  const persona = getPersona(profile);

  if (!profile) {
    return {
      text: buildFallbackMessage(categories, persona),
      category: primaryCategory,
      persona,
      buttons: [...DAILY_BUTTONS],
    };
  }

  const birthProfile: BirthProfile = {
    birth_year: profile.birth_year,
    birth_month: profile.birth_month,
    birth_day: profile.birth_day,
    birth_hour: profile.birth_hour,
    birth_minute: profile.birth_minute,
    gender: profile.gender,
  };

  const [userSaju, todayGanji] = await Promise.all([
    calculateSajuPillars(birthProfile),
    Promise.resolve(getTodayGanji()),
  ]);

  // 일간-일진 상호작용 분석
  const dayInteraction = analyzeDayInteraction(userSaju.dayStem, todayGanji.dayStem);
  const userElement = STEM_ELEMENTS[userSaju.dayStem] || '';
  const userElementDisplay = userElement ? ` (${userElement})` : '';

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const dateText = formatSeoulDate(now);
  // 서울 시간 기준 월/일 추출
  const seoulDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pickDate = (type: string) => seoulDateParts.find((p) => p.type === type)?.value ?? '01';
  const monthDay = `${Number(pickDate('month'))}월 ${Number(pickDate('day'))}일`;
  const categoryText = categories.join(' + ');

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.85,
    max_completion_tokens: 450,
    messages: [
      { role: 'system', content: DAILY_PUSH_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `[오늘] ${dateText} (${monthDay})`,
          `[오늘의 일진] ${todayGanji.dayPillar}일 (${todayGanji.dayStemElement} 기운)`,
          ``,
          `[사용자 정보]`,
          `- 사주 원국: ${userSaju.fullString}`,
          `- 일간: ${userSaju.dayStem}${userElementDisplay}`,
          `- 관심사: ${categoryText}`,
          `- 페르소나: ${persona ?? '없음'}`,
          ``,
          `[오늘의 일간-일진 관계]`,
          `${dayInteraction}`,
          ``,
          `[작성 지침]`,
          `1. 첫 줄: "${monthDay}, 오늘 ${todayGanji.dayPillar}일! 네 ${userSaju.dayStem}${userElement ? userElement : ''}에게는..." 으로 시작`,
          `2. 3대 키워드 제시`,
          `3. 황금 시간대 (██시~██시) — 블랭크`,
          `4. 길방 (████ 방향) — 블랭크`,
          `5. 주의 인물 (████한 사람) — 블랭크`,
          `6. 액션 가이드 (████ 해둬) — 블랭크`,
          `7. 마지막: 궁금증 유발 질문`,
          ``,
          `350자 내외. 블랭크 최소 4개. GPT 티 빼고 친한 형/언니 톤.`,
        ].join('\n'),
      },
    ],
  });

  let rawText = completion.choices?.[0]?.message?.content?.trim() || '';

  // 일진 강제 교정: LLM이 잘못된 일진을 생성했을 경우 정확한 일진으로 교체
  const correctDayPillar = todayGanji.dayPillar;
  const wrongPillars = ['갑자', '을축', '병인', '정묘', '무진', '기사', '경오', '신미', '임신', '계유',
    '갑술', '을해', '병자', '정축', '무인', '기묘', '경진', '신사', '임오', '계미',
    '갑신', '을유', '병술', '정해', '무자', '기축', '경인', '신묘', '임진', '계사',
    '갑오', '을미', '병신', '정유', '무술', '기해', '경자', '신축', '임인', '계묘',
    '갑진', '을사', '병오', '정미', '무신', '기유', '경술', '신해', '임자', '계축',
    '갑인', '을묘', '병진', '정사', '무오', '기미', '경신', '신유', '임술', '계해'];

  for (const wrong of wrongPillars) {
    if (wrong !== correctDayPillar && rawText.includes(wrong + '일')) {
      rawText = rawText.replace(new RegExp(wrong + '일', 'g'), correctDayPillar + '일');
      console.log(`[daily-message] Corrected day pillar: ${wrong} → ${correctDayPillar}`);
    }
  }

  let text = enforceMessageRules(rawText, categories);

  // 메시지 시작에 정확한 일진 보장
  const expectedStart = `${monthDay}`;
  if (!text.startsWith(expectedStart)) {
    // 첫 줄이 날짜로 시작하지 않으면 추가
    const dayPillarHeader = `📅 ${monthDay} ${todayGanji.dayPillar}일\n\n`;
    text = dayPillarHeader + text;
  }

  return {
    text,
    category: categoryText,
    persona,
    buttons: [...DAILY_BUTTONS],
  };
}

export async function generate_daily_message(user_id: number): Promise<DailyMessageResult> {
  return generateDailyMessage(user_id);
}

/**
 * 프리미엄 사용자용: 블랭크 없는 전체 풀이 메시지 생성.
 */
export async function generateFullDailyMessage(userId: number): Promise<string> {
  const profile = await getProfile('telegram', String(userId));
  if (!profile) return '프로필 정보를 찾을 수 없습니다. /profile 로 등록해주세요.';

  const topInterests = await get_user_top_interests(userId);
  const now = getSeoulNow();
  const weekday = now.getUTCDay();
  const categories = resolveDailyCategories(weekday, topInterests);
  const persona = getPersona(profile);

  const birthProfile: BirthProfile = {
    birth_year: profile.birth_year,
    birth_month: profile.birth_month,
    birth_day: profile.birth_day,
    birth_hour: profile.birth_hour,
    birth_minute: profile.birth_minute,
    gender: profile.gender,
  };

  const [natalSaju, todayGanji] = await Promise.all([
    calculateSajuPillars(birthProfile),
    Promise.resolve(getTodayGanji()),
  ]);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const dateText = formatSeoulDate(now);
  const categoryText = categories.join(' + ');

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    max_completion_tokens: 600,
    messages: [
      { role: 'system', content: FULL_DAILY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `[오늘 날짜] ${dateText}`,
          `[관심 카테고리] ${categoryText}`,
          `[사용자 페르소나] ${persona ?? '없음'}`,
          `[사용자 사주 원국] ${natalSaju.fullString}`,
          `[오늘의 천간지지] ${todayGanji.dayPillar}일 (${todayGanji.dayStemElement} 기운)`,
          '블랭크(████) 없이 모든 정보를 공개하여 500자 내외로 작성.',
        ].join('\n'),
      },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() || '전체 풀이 생성에 실패했습니다.';
}

/**
 * 무료 사용자 "다음에 할게요" 클릭 시: 힌트 1개만 공개하는 메시지 생성.
 */
export async function generateHintMessage(userId: number): Promise<string> {
  const profile = await getProfile('telegram', String(userId));
  if (!profile) return '💫 내일도 아침에 찾아올게요 🌅';

  const topInterests = await get_user_top_interests(userId);
  const now = getSeoulNow();
  const weekday = now.getUTCDay();
  const categories = resolveDailyCategories(weekday, topInterests);
  const persona = getPersona(profile);

  const birthProfile: BirthProfile = {
    birth_year: profile.birth_year,
    birth_month: profile.birth_month,
    birth_day: profile.birth_day,
    birth_hour: profile.birth_hour,
    birth_minute: profile.birth_minute,
    gender: profile.gender,
  };

  const [natalSaju, todayGanji] = await Promise.all([
    calculateSajuPillars(birthProfile),
    Promise.resolve(getTodayGanji()),
  ]);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const dateText = formatSeoulDate(now);
  const categoryText = categories.join(' + ');

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    max_completion_tokens: 180,
    messages: [
      { role: 'system', content: HINT_DAILY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `[오늘 날짜] ${dateText}`,
          `[관심 카테고리] ${categoryText}`,
          `[사용자 페르소나] ${persona ?? '없음'}`,
          `[사용자 사주 원국] ${natalSaju.fullString}`,
          `[오늘의 천간지지] ${todayGanji.dayPillar}일 (${todayGanji.dayStemElement} 기운)`,
          '블랭크 1개만 해제. 150자 이내. 마지막에 "내일도 아침에 찾아올게요 🌅"',
        ].join('\n'),
      },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() || '💫 이것만 먼저 알려줄게 — 오늘 오후가 중요해!\n내일도 아침에 찾아올게요 🌅';
}
