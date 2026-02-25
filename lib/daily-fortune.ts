/**
 * 오늘의 운세 (Daily Fortune) — 무료 일일 운세.
 * 경쟁사(점신, 포스텔러)의 핵심 무료 기능을 구현.
 * 매일 아침 사용자가 확인하는 습관을 만드는 핵심 engagement hook.
 * 
 * Features:
 * - 오늘의 운세 점수 (100점 만점)
 * - 시간대별 운세 (오전/오후/저녁)
 * - 오늘의 행운 아이템 (색상, 방향, 숫자)
 * - 카테고리별 운세 (연애/재물/직장/건강)
 * - 프리미엄: 시간대별 상세 + 택일 가이드
 */

import OpenAI from 'openai';
import { supabase } from './supabase';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

// === 일진 계산 (kakao-service.ts와 동일 로직) ===
const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const STEM_ELEMENTS: Record<string, string> = {
  '갑': '목', '을': '목', '병': '화', '정': '화', '무': '토',
  '기': '토', '경': '금', '신': '금', '임': '수', '계': '수',
};
const ELEMENT_EMOJI: Record<string, string> = {
  '목': '🌳', '화': '🔥', '토': '🏔️', '금': '⚔️', '수': '💧',
};

function calculateDayPillar(year: number, month: number, day: number) {
  const referenceDate = new Date(Date.UTC(2026, 1, 23));
  const referenceStemIndex = 4;
  const referenceBranchIndex = 4;
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const diffDays = Math.round((targetDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
  let stemIndex = (referenceStemIndex + diffDays) % 10;
  let branchIndex = (referenceBranchIndex + diffDays) % 12;
  if (stemIndex < 0) stemIndex += 10;
  if (branchIndex < 0) branchIndex += 12;
  return { stem: STEMS[stemIndex], branch: BRANCHES[branchIndex] };
}

function getSeoulDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const pick = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, string> = {
    'Mon': '월', 'Tue': '화', 'Wed': '수', 'Thu': '목', 'Fri': '금', 'Sat': '토', 'Sun': '일',
  };
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    weekday: weekdayMap[pick('weekday')] || '',
  };
}

// === 오행 상호작용 분석 ===
function analyzeElementInteraction(userElement: string, dayElement: string): {
  relation: string;
  score: number;
  desc: string;
} {
  const generates: Record<string, string> = { '목': '화', '화': '토', '토': '금', '금': '수', '수': '목' };
  const controls: Record<string, string> = { '목': '토', '화': '금', '토': '수', '금': '목', '수': '화' };

  if (userElement === dayElement) {
    return { relation: '비화', score: 70, desc: '비슷한 에너지 — 경쟁과 자기주장이 강해지는 날' };
  }
  if (generates[dayElement] === userElement) {
    return { relation: '인성', score: 90, desc: '도움과 지원의 에너지 — 좋은 조언을 받을 수 있는 날' };
  }
  if (generates[userElement] === dayElement) {
    return { relation: '식상', score: 80, desc: '표현과 창작의 에너지 — 소통에 유리한 날' };
  }
  if (controls[userElement] === dayElement) {
    return { relation: '재성', score: 85, desc: '재물의 에너지 — 돈과 기회가 움직이는 날' };
  }
  if (controls[dayElement] === userElement) {
    return { relation: '관성', score: 55, desc: '압박의 에너지 — 조심스럽게 움직여야 하는 날' };
  }
  return { relation: '중립', score: 75, desc: '특별한 충돌 없이 무난한 하루' };
}

// === 운세 점수 계산 ===
function calculateFortuneScore(
  userStem: string,
  dayPillar: { stem: string; branch: string },
): {
  overall: number;
  love: number;
  money: number;
  career: number;
  health: number;
} {
  const userElement = STEM_ELEMENTS[userStem] || '토';
  const dayElement = STEM_ELEMENTS[dayPillar.stem] || '토';
  const interaction = analyzeElementInteraction(userElement, dayElement);

  // 기본 점수에 요소별 변동 추가
  const base = interaction.score;
  const dayNum = new Date().getDate();
  
  // 각 카테고리별 미세 변동 (seed-based pseudo random)
  const seed = (dayNum * 7 + STEMS.indexOf(userStem) * 13 + BRANCHES.indexOf(dayPillar.branch) * 3);
  const vary = (n: number) => Math.max(30, Math.min(100, base + ((seed * n) % 21) - 10));

  return {
    overall: Math.max(35, Math.min(98, base + ((seed * 17) % 15) - 7)),
    love: vary(23),
    money: vary(37),
    career: vary(41),
    health: vary(53),
  };
}

// === 행운 아이템 생성 ===
function getLuckyItems(dayPillar: { stem: string; branch: string }, userElement: string): {
  color: string;
  direction: string;
  number: number;
  food: string;
  time: string;
} {
  const dayElement = STEM_ELEMENTS[dayPillar.stem] || '토';
  
  const colors: Record<string, string[]> = {
    '목': ['초록', '청록', '연두'],
    '화': ['빨강', '주황', '분홍'],
    '토': ['노랑', '베이지', '갈색'],
    '금': ['흰색', '은색', '골드'],
    '수': ['검정', '남색', '파랑'],
  };

  const directions: Record<string, string[]> = {
    '목': ['동쪽', '동남쪽'],
    '화': ['남쪽', '남동쪽'],
    '토': ['중앙'],
    '금': ['서쪽', '북서쪽'],
    '수': ['북쪽', '북동쪽'],
  };

  const foods: Record<string, string[]> = {
    '목': ['샐러드', '녹차', '과일'],
    '화': ['매운 음식', '커피', '구운 고기'],
    '토': ['떡볶이', '빵', '달콤한 디저트'],
    '금': ['삼겹살', '치킨', '매실차'],
    '수': ['국밥', '해물', '차가운 음료'],
  };

  // 용신(도움이 되는 오행) 기반 추천
  const generates: Record<string, string> = { '목': '수', '화': '목', '토': '화', '금': '토', '수': '금' };
  const helpful = generates[userElement] || dayElement;

  const dayNum = new Date().getDate();
  const pick = (arr: string[]) => arr[dayNum % arr.length];

  return {
    color: pick(colors[helpful] || ['파랑']),
    direction: pick(directions[helpful] || ['남쪽']),
    number: ((dayNum * 3 + STEMS.indexOf(dayPillar.stem)) % 9) + 1,
    food: pick(foods[helpful] || ['따뜻한 차']),
    time: dayElement === '화' || dayElement === '목' ? '오전 10시~오후 1시' : '오후 2시~5시',
  };
}

// === 점수 시각화 ===
function scoreToEmoji(score: number): string {
  if (score >= 90) return '🌟🌟🌟🌟🌟';
  if (score >= 80) return '🌟🌟🌟🌟';
  if (score >= 70) return '🌟🌟🌟';
  if (score >= 60) return '🌟🌟';
  if (score >= 50) return '🌟';
  return '☁️';
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// === 캐시 체크 (하루에 한 번만 생성) ===
async function getCachedDailyFortune(
  platform: string,
  userId: string,
  date: string,
): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('daily_fortune_cache')
    .select('content')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .eq('date', date)
    .single();
  return data?.content ?? null;
}

async function cacheDailyFortune(
  platform: string,
  userId: string,
  date: string,
  content: string,
): Promise<void> {
  if (!supabase) return;
  await supabase.from('daily_fortune_cache').upsert({
    platform,
    platform_user_id: userId,
    date,
    content,
  }, { onConflict: 'platform,platform_user_id,date' });
}

// === 메인: 오늘의 운세 생성 ===
export interface DailyFortuneResult {
  freeSection: string;
  premiumSection: string;
  scores: {
    overall: number;
    love: number;
    money: number;
    career: number;
    health: number;
  };
}

export async function generateDailyFortune(
  platform: string,
  userId: string,
  userStem: string,
  userSajuString: string,
): Promise<DailyFortuneResult> {
  const seoul = getSeoulDate();
  const today = calculateDayPillar(seoul.year, seoul.month, seoul.day);
  const dateStr = `${seoul.year}-${String(seoul.month).padStart(2, '0')}-${String(seoul.day).padStart(2, '0')}`;

  // 캐시 확인
  const cached = await getCachedDailyFortune(platform, userId, dateStr);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { /* regenerate */ }
  }

  const userElement = STEM_ELEMENTS[userStem] || '토';
  const dayElement = STEM_ELEMENTS[today.stem] || '토';
  const scores = calculateFortuneScore(userStem, today);
  const luckyItems = getLuckyItems(today, userElement);
  const interaction = analyzeElementInteraction(userElement, dayElement);

  // FREE 섹션 (즉시 생성 - LLM 없이)
  const freeSection = `🔮 *${seoul.month}월 ${seoul.day}일(${seoul.weekday}) 오늘의 운세*

📅 오늘의 일진: ${today.stem}${today.branch}일 (${ELEMENT_EMOJI[dayElement]} ${dayElement} 기운)
🧭 나의 일간: ${userStem} (${ELEMENT_EMOJI[userElement]} ${userElement})

*📊 오늘의 운세 점수: ${scores.overall}점*
${scoreToEmoji(scores.overall)}

💕 연애 ${scoreBar(scores.love)} ${scores.love}점
💰 재물 ${scoreBar(scores.money)} ${scores.money}점
💼 직장 ${scoreBar(scores.career)} ${scores.career}점
🩺 건강 ${scoreBar(scores.health)} ${scores.health}점

*🎯 오늘의 에너지*
${interaction.desc}

*🍀 오늘의 행운*
🎨 행운색: ${luckyItems.color}
🧭 행운 방향: ${luckyItems.direction}
🔢 행운 숫자: ${luckyItems.number}
🍽️ 행운 음식: ${luckyItems.food}
⏰ 황금 시간대: ${luckyItems.time}`;

  // PREMIUM 섹션 (LLM으로 상세 분석)
  let premiumSection = '';
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.8,
      max_completion_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `오늘의 상세 운세를 작성해. 사주 전문가 톤.

규칙:
- 오늘의 일진과 사용자 일간의 관계를 기반으로 시간대별 가이드 작성
- 오전(6-12시), 오후(12-18시), 저녁(18-24시) 구분
- 각 시간대마다: 핵심 에너지 + 구체적 행동 지침 + 피해야 할 것
- 마지막에 "오늘의 개운법" 1-2가지
- 친한 형/언니 톤, 400자 내외
- 존댓말 사용
- *볼드*로 핵심 강조`,
        },
        {
          role: 'user',
          content: `오늘: ${seoul.month}월 ${seoul.day}일(${seoul.weekday}), 일진: ${today.stem}${today.branch}일
사용자 사주: ${userSajuString}, 일간: ${userStem}(${userElement})
오행 관계: ${interaction.relation} — ${interaction.desc}
운세 점수: 종합${scores.overall} 연애${scores.love} 재물${scores.money} 직장${scores.career} 건강${scores.health}`,
        },
      ],
    });
    premiumSection = response.choices?.[0]?.message?.content?.trim() ?? '';
  } catch {
    premiumSection = `*⏰ 시간대별 가이드*

🌅 오전: ${userElement}의 기운이 안정되는 시간. 중요한 결정은 오전에.
🌤️ 오후: ${dayElement} 에너지가 강해지는 시간. ${interaction.relation === '재성' ? '재물 관련 활동에 유리' : '소통과 협업에 집중'}.
🌙 저녁: 에너지가 전환되는 시간. 무리하지 말고 정리하는 시간으로.

*✨ 오늘의 개운법*
${luckyItems.color} 계열 아이템을 착용하고, ${luckyItems.direction}으로 이동하면 기운이 좋아져요.`;
  }

  const result: DailyFortuneResult = { freeSection, premiumSection, scores };

  // 캐시 저장 (fire-and-forget)
  cacheDailyFortune(platform, userId, dateStr, JSON.stringify(result)).catch(() => {});

  return result;
}
