import OpenAI from 'openai';
import { getProfile } from '@/lib/user-profile';
import { getUserTopInterests } from '@/lib/interest-helpers';
import type { InterestCategory } from '@/lib/interest-analyzer';
import {
  CATEGORY_EMOJI,
  DAILY_BUTTONS,
  DAILY_PUSH_SYSTEM_PROMPT,
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

async function calculateSajuPillars(profile: BirthProfile): Promise<string> {
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
  return `${data.pillars.year}년 ${data.pillars.month}월 ${data.pillars.day}일 ${data.pillars.hour}시`;
}

async function getTodayGanji(gender: '남성' | '여성'): Promise<string> {
  const today = getSeoulNow();
  const params = new URLSearchParams({
    y: String(today.getUTCFullYear()),
    m: String(today.getUTCMonth() + 1),
    d: String(today.getUTCDate()),
    hh: '12',
    mm: '0',
    calendar: 'solar',
    gender: gender === '여성' ? '여' : '남',
  });

  const response = await fetch(`https://beta-ybz6.onrender.com/api/saju?${params}`);
  if (!response.ok) {
    throw new Error('오늘 천간지지 계산 실패');
  }

  const data = await response.json();
  return `${data.pillars.day}`;
}

function buildFallbackMessage(categories: DailyMessageCategory[], persona: string | null): string {
  const primary = categories[0] || 'general';
  const emoji = CATEGORY_EMOJI[primary] || '✨';
  const tone = persona ? `${persona}의 촉으로` : '오늘 흐름으로';
  const text = `${emoji} 오늘의 키워드: ${primary}
점심시간 전후, ${tone} ██시에 중요한 신호가 보여. ████ 쪽 선택을 미루지 말고 확인해.
이 타이밍을 먼저 잡는 사람이 누굴까?`;
  return text.slice(0, 200);
}

function enforceMessageRules(raw: string, categories: DailyMessageCategory[]): string {
  let text = raw.trim();
  if (!text) return buildFallbackMessage(categories, null);

  const lines = text.split('\n').filter(Boolean);
  const primary = categories[0] || 'general';
  const emoji = CATEGORY_EMOJI[primary] || '✨';

  if (!lines[0].includes(emoji)) {
    lines[0] = `${emoji} ${lines[0].replace(/^[-*•\s]+/, '')}`;
  }

  text = lines.join('\n');

  if (!text.includes('████')) {
    text = `${text}\n오늘의 핵심 변수는 ████.`;
  }

  if (!text.includes('?')) {
    text = `${text}\n오늘, 이 신호를 먼저 읽어낼 수 있을까?`;
  }

  if (text.length > 200) {
    text = text.slice(0, 200).trim();
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

  const [natalSaju, todayGanji] = await Promise.all([
    calculateSajuPillars(birthProfile),
    getTodayGanji(profile.gender),
  ]);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const dateText = formatSeoulDate(now);
  const categoryText = categories.join(' + ');

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.85,
    max_completion_tokens: 220,
    messages: [
      { role: 'system', content: DAILY_PUSH_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `[오늘 날짜] ${dateText}`,
          `[관심 카테고리] ${categoryText}`,
          `[사용자 페르소나] ${persona ?? '없음'}`,
          `[사용자 사주 원국] ${natalSaju}`,
          `[오늘의 천간지지] ${todayGanji}`,
          '[메시지 톤 가이드] 카테고리 톤 가이드를 강하게 반영',
          '200자 이내, 첫 줄 키워드+이모지, 구체 시간/상황, ████ 1회 이상, 마지막 줄은 궁금증 유발 문장으로 작성.',
        ].join('\n'),
      },
    ],
  });

  const rawText = completion.choices?.[0]?.message?.content?.trim() || '';
  const text = enforceMessageRules(rawText, categories);

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
