/**
 * 운세 캘린더 & 택일 모듈.
 * 포스텔러의 핵심 기능: 계약/면접/이사 등 중요한 날을 택할 수 있는 기능.
 */

const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const STEM_ELEMENTS: Record<string, string> = {
  '갑': '목', '을': '목', '병': '화', '정': '화', '무': '토',
  '기': '토', '경': '금', '신': '금', '임': '수', '계': '수',
};

function calculateDayPillar(year: number, month: number, day: number) {
  const referenceDate = new Date(Date.UTC(2026, 1, 23));
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const diffDays = Math.round((targetDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
  let stemIdx = (4 + diffDays) % 10;
  let branchIdx = (4 + diffDays) % 12;
  if (stemIdx < 0) stemIdx += 10;
  if (branchIdx < 0) branchIdx += 12;
  return { stem: STEMS[stemIdx], branch: BRANCHES[branchIdx] };
}

const CLASH_PAIRS: Record<string, string> = {
  '자': '오', '오': '자', '축': '미', '미': '축',
  '인': '신', '신': '인', '묘': '유', '유': '묘',
  '진': '술', '술': '진', '사': '해', '해': '사',
};

const COMBINE_PAIRS: Record<string, string> = {
  '자': '축', '축': '자', '인': '해', '해': '인',
  '묘': '술', '술': '묘', '진': '유', '유': '진',
  '사': '신', '신': '사', '오': '미', '미': '오',
};

const GENERATES: Record<string, string> = { '목': '화', '화': '토', '토': '금', '금': '수', '수': '목' };
const GENERATED_BY: Record<string, string> = { '목': '수', '화': '목', '토': '화', '금': '토', '수': '금' };

export type EventType = '계약' | '면접' | '이사' | '개업' | '결혼' | '여행' | '투자' | '시험' | '데이트' | '기타';

const EVENT_FAVORABLE_ELEMENTS: Record<EventType, string[]> = {
  '계약': ['금', '토'],
  '면접': ['화', '목'],
  '이사': ['토', '수'],
  '개업': ['목', '화'],
  '결혼': ['화', '토'],
  '여행': ['수', '목'],
  '투자': ['금', '수'],
  '시험': ['수', '목'],
  '데이트': ['화', '목'],
  '기타': [],
};

export interface DayScore {
  date: string;
  dayPillar: string;
  score: number;
  grade: '최적' | '좋음' | '보통' | '주의' | '피할것';
  reason: string;
}

/**
 * 특정 기간 내 택일 분석.
 * @param userDayStem 사용자 일주의 천간
 * @param userDayBranch 사용자 일주의 지지
 * @param eventType 이벤트 유형
 * @param days 분석할 일수 (기본 14일)
 */
export function analyzeAuspiciousDays(
  userDayStem: string,
  userDayBranch: string,
  eventType: EventType,
  days: number = 14,
): DayScore[] {
  const userElement = STEM_ELEMENTS[userDayStem] || '토';
  const favorableElements = EVENT_FAVORABLE_ELEMENTS[eventType] || [];
  
  const now = new Date();
  const results: DayScore[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const pillar = calculateDayPillar(y, m, d);
    const dayElement = STEM_ELEMENTS[pillar.stem] || '토';

    let score = 70; // base score
    const reasons: string[] = [];

    // 1. 충 체크 (사용자 일지와 해당 날 지지)
    if (CLASH_PAIRS[userDayBranch] === pillar.branch) {
      score -= 25;
      reasons.push(`일지 충(${userDayBranch}-${pillar.branch})`);
    }

    // 2. 합 체크
    if (COMBINE_PAIRS[userDayBranch] === pillar.branch) {
      score += 15;
      reasons.push(`일지 합(${userDayBranch}-${pillar.branch})`);
    }

    // 3. 이벤트에 유리한 오행
    if (favorableElements.includes(dayElement)) {
      score += 12;
      reasons.push(`${eventType}에 유리한 ${dayElement} 기운`);
    }

    // 4. 상생 관계
    if (GENERATED_BY[userElement] === dayElement) {
      score += 10;
      reasons.push('인성 — 도움 받는 날');
    } else if (GENERATES[userElement] === dayElement) {
      score += 5;
      reasons.push('식상 — 표현에 유리한 날');
    }

    // 5. 상극 (받는 쪽)
    const controls: Record<string, string> = { '목': '토', '화': '금', '토': '수', '금': '목', '수': '화' };
    if (controls[dayElement] === userElement) {
      score -= 15;
      reasons.push('관살 — 압박의 날');
    }

    score = Math.max(15, Math.min(100, score));

    let grade: DayScore['grade'];
    if (score >= 85) grade = '최적';
    else if (score >= 70) grade = '좋음';
    else if (score >= 55) grade = '보통';
    else if (score >= 40) grade = '주의';
    else grade = '피할것';

    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const wd = weekdays[date.getDay()];

    results.push({
      date: `${m}/${d}(${wd})`,
      dayPillar: `${pillar.stem}${pillar.branch}`,
      score,
      grade,
      reason: reasons.length > 0 ? reasons.join(', ') : '무난한 날',
    });
  }

  return results;
}

/**
 * 택일 결과를 텍스트로 포맷팅.
 */
export function formatAuspiciousDays(
  results: DayScore[],
  eventType: EventType,
  topN: number = 5,
): string {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, topN);
  const worst = sorted.slice(-2);

  const gradeEmoji: Record<string, string> = {
    '최적': '🟢', '좋음': '🔵', '보통': '⚪', '주의': '🟡', '피할것': '🔴',
  };

  const lines: string[] = [];
  lines.push(`📅 *${eventType} 택일 분석* (향후 ${results.length}일)`);
  lines.push('');
  lines.push('*추천 날짜 TOP 5*');
  
  for (const day of top) {
    lines.push(`${gradeEmoji[day.grade]} *${day.date}* ${day.dayPillar}일 — ${day.score}점 (${day.grade})`);
    lines.push(`   ${day.reason}`);
  }

  lines.push('');
  lines.push('*피해야 할 날*');
  for (const day of worst) {
    if (day.score < 55) {
      lines.push(`${gradeEmoji[day.grade]} ${day.date} ${day.dayPillar}일 — ${day.score}점 (${day.grade})`);
      lines.push(`   ${day.reason}`);
    }
  }

  return lines.join('\n');
}

/**
 * 택일 질문 감지.
 */
export function isAuspiciousDayQuestion(text: string): EventType | null {
  const patterns: [RegExp, EventType][] = [
    [/택일|길일|좋은\s*날/, '기타'],
    [/(계약|사인|도장).*날|날.*계약/, '계약'],
    [/(면접|시험|합격).*날|날.*(면접|시험)/, '면접'],
    [/(이사|입주).*날|날.*(이사|입주)/, '이사'],
    [/(개업|오픈|창업).*날|날.*(개업|오픈)/, '개업'],
    [/(결혼|혼인|예식).*날|날.*(결혼|혼인)/, '결혼'],
    [/(여행|출장).*날|날.*(여행|출장)/, '여행'],
    [/(투자|매수|매도).*날|날.*(투자|매수)/, '투자'],
    [/시험.*날|날.*시험/, '시험'],
    [/(데이트|만남|소개팅).*날|날.*(데이트|만남)/, '데이트'],
    [/언제.*(좋|괜찮|될까|해야|하면)/, '기타'],
  ];

  for (const [pattern, eventType] of patterns) {
    if (pattern.test(text)) return eventType;
  }
  return null;
}
