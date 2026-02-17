// 사주 구조 핵심 정보 (천간/지지 오행, 월지 계절, 일간 강약 추정)

const STEM_ELEMENTS = {
  '갑': '목',
  '을': '목',
  '병': '화',
  '정': '화',
  '무': '토',
  '기': '토',
  '경': '금',
  '신': '금',
  '임': '수',
  '계': '수',
};

const BRANCH_ELEMENTS = {
  '자': '수',
  '축': '토',
  '인': '목',
  '묘': '목',
  '진': '토',
  '사': '화',
  '오': '화',
  '미': '토',
  '신': '금',
  '유': '금',
  '술': '토',
  '해': '수',
};

const GENERATED_BY = {
  '목': '수',
  '화': '목',
  '토': '화',
  '금': '토',
  '수': '금',
};

const GENERATES = {
  '목': '화',
  '화': '토',
  '토': '금',
  '금': '수',
  '수': '목',
};

const CONTROLS = {
  '목': '토',
  '화': '금',
  '토': '수',
  '금': '목',
  '수': '화',
};

function extractStem(ganzi) {
  if (!ganzi || ganzi.length < 1) return null;
  return ganzi[0];
}

function extractBranch(ganzi) {
  if (!ganzi || ganzi.length < 2) return null;
  return ganzi[1];
}

function getSeasonByMonthBranch(monthBranch) {
  if (!monthBranch) return { season: '미상', climate: '판단 불가' };
  if (['인', '묘', '진'].includes(monthBranch)) return { season: '봄', climate: '목왕' };
  if (['사', '오', '미'].includes(monthBranch)) return { season: '여름', climate: '화왕' };
  if (['신', '유', '술'].includes(monthBranch)) return { season: '가을', climate: '금왕' };
  if (['해', '자', '축'].includes(monthBranch)) return { season: '겨울', climate: '수왕' };
  return { season: '미상', climate: '판단 불가' };
}

function getStrengthContribution(dayElement, otherElement) {
  if (!dayElement || !otherElement) return 0;
  if (dayElement === otherElement) return 1.0;
  if (GENERATED_BY[dayElement] === otherElement) return 0.8;
  if (GENERATES[dayElement] === otherElement) return -0.6;
  if (CONTROLS[otherElement] === dayElement) return -1.0;
  if (CONTROLS[dayElement] === otherElement) return -0.4;
  return 0;
}

function getStrengthLabel(score) {
  if (score >= 2.0) return '강함';
  if (score <= -2.0) return '약함';
  return '중화';
}

export function analyzeSajuStructure(saju) {
  const pillars = {
    year: saju.year,
    month: saju.month,
    day: saju.day,
    hour: saju.hour,
  };

  const stemInfo = {};
  const branchInfo = {};

  const dayStem = extractStem(saju.day);
  const dayElement = STEM_ELEMENTS[dayStem] || '미상';

  Object.entries(pillars).forEach(([key, value]) => {
    const stem = extractStem(value);
    const branch = extractBranch(value);
    stemInfo[key] = {
      stem,
      element: STEM_ELEMENTS[stem] || '미상',
    };
    branchInfo[key] = {
      branch,
      element: BRANCH_ELEMENTS[branch] || '미상',
    };
  });

  const monthBranch = branchInfo.month.branch;
  const monthSeason = getSeasonByMonthBranch(monthBranch);

  const weightedElements = [
    { element: stemInfo.year.element, weight: 1.0 },
    { element: stemInfo.month.element, weight: 1.3 },
    { element: stemInfo.day.element, weight: 1.0 },
    { element: stemInfo.hour.element, weight: 1.0 },
    { element: branchInfo.year.element, weight: 1.0 },
    { element: branchInfo.month.element, weight: 1.8 },
    { element: branchInfo.day.element, weight: 1.0 },
    { element: branchInfo.hour.element, weight: 1.0 },
  ];

  const score = weightedElements.reduce((acc, item) => {
    return acc + getStrengthContribution(dayElement, item.element) * item.weight;
  }, 0);

  const strength = {
    score: Number(score.toFixed(2)),
    label: getStrengthLabel(score),
  };

  return {
    dayMaster: {
      stem: dayStem,
      element: dayElement,
      strength,
    },
    monthSupport: {
      branch: monthBranch,
      element: branchInfo.month.element,
      season: monthSeason.season,
      climate: monthSeason.climate,
    },
    stemElements: stemInfo,
    branchElements: branchInfo,
  };
}

