// 육친(六親) 계산 로직

// 천간 정보
const HEAVENLY_STEMS = {
  '갑': { element: '목', yinyang: '양' },
  '을': { element: '목', yinyang: '음' },
  '병': { element: '화', yinyang: '양' },
  '정': { element: '화', yinyang: '음' },
  '무': { element: '토', yinyang: '양' },
  '기': { element: '토', yinyang: '음' },
  '경': { element: '금', yinyang: '양' },
  '신': { element: '금', yinyang: '음' },
  '임': { element: '수', yinyang: '양' },
  '계': { element: '수', yinyang: '음' }
};

// 오행 상생상극 관계
const ELEMENT_RELATIONS = {
  // 나를 생하는 것 (인성)
  생아: {
    '목': '수',  // 수생목
    '화': '목',  // 목생화
    '토': '화',  // 화생토
    '금': '토',  // 토생금
    '수': '금'   // 금생수
  },
  // 내가 생하는 것 (식상)
  아생: {
    '목': '화',  // 목생화
    '화': '토',  // 화생토
    '토': '금',  // 토생금
    '금': '수',  // 금생수
    '수': '목'   // 수생목
  },
  // 나를 극하는 것 (관살)
  극아: {
    '목': '금',  // 금극목
    '화': '수',  // 수극화
    '토': '목',  // 목극토
    '금': '화',  // 화극금
    '수': '토'   // 토극수
  },
  // 내가 극하는 것 (재성)
  아극: {
    '목': '토',  // 목극토
    '화': '금',  // 화극금
    '토': '수',  // 토극수
    '금': '목',  // 금극목
    '수': '화'   // 수극화
  }
};

/**
 * 천간에서 첫 글자 추출 (예: "갑자" -> "갑")
 */
function extractStem(ganzi) {
  if (!ganzi || ganzi.length === 0) return null;
  return ganzi[0];
}

/**
 * 육친 계산
 * @param {string} ilgan - 일간 (예: "무")
 * @param {string} target - 대상 천간 (예: "정")
 * @returns {string} - 육친 이름 (예: "정인")
 */
export function calculateYukchin(ilgan, target) {
  // 같은 천간인 경우 (비견/겁재)
  if (ilgan === target) {
    return '비견';
  }

  const ilganInfo = HEAVENLY_STEMS[ilgan];
  const targetInfo = HEAVENLY_STEMS[target];

  if (!ilganInfo || !targetInfo) {
    return '미상';
  }

  const ilganElement = ilganInfo.element;
  const ilganYinyang = ilganInfo.yinyang;
  const targetElement = targetInfo.element;
  const targetYinyang = targetInfo.yinyang;

  // 같은 오행인 경우 (비견/겁재)
  if (ilganElement === targetElement) {
    if (ilganYinyang === targetYinyang) {
      return '비견';
    } else {
      return '겁재';
    }
  }

  // 나를 생하는 것 (인성)
  if (ELEMENT_RELATIONS.생아[ilganElement] === targetElement) {
    if (ilganYinyang === targetYinyang) {
      return '편인';
    } else {
      return '정인';
    }
  }

  // 내가 생하는 것 (식상)
  if (ELEMENT_RELATIONS.아생[ilganElement] === targetElement) {
    if (ilganYinyang === targetYinyang) {
      return '식신';
    } else {
      return '상관';
    }
  }

  // 나를 극하는 것 (관살)
  if (ELEMENT_RELATIONS.극아[ilganElement] === targetElement) {
    if (ilganYinyang === targetYinyang) {
      return '편관';
    } else {
      return '정관';
    }
  }

  // 내가 극하는 것 (재성)
  if (ELEMENT_RELATIONS.아극[ilganElement] === targetElement) {
    if (ilganYinyang === targetYinyang) {
      return '편재';
    } else {
      return '정재';
    }
  }

  return '미상';
}

/**
 * 사주 전체의 육친 분석
 * @param {object} saju - { year, month, day, hour }
 * @returns {object} - 각 기둥별 육친 정보
 */
export function analyzeSajuYukchin(saju) {
  const ilgan = extractStem(saju.day);

  if (!ilgan) {
    return null;
  }

  return {
    ilgan,
    year: {
      ganzi: saju.year,
      stem: extractStem(saju.year),
      yukchin: calculateYukchin(ilgan, extractStem(saju.year))
    },
    month: {
      ganzi: saju.month,
      stem: extractStem(saju.month),
      yukchin: calculateYukchin(ilgan, extractStem(saju.month))
    },
    day: {
      ganzi: saju.day,
      stem: extractStem(saju.day),
      yukchin: '일간'
    },
    hour: {
      ganzi: saju.hour,
      stem: extractStem(saju.hour),
      yukchin: calculateYukchin(ilgan, extractStem(saju.hour))
    }
  };
}

/**
 * 육친 정보를 문자열로 변환
 */
export function formatYukchinString(yukchinInfo) {
  if (!yukchinInfo) return '';

  return `
일간: ${yukchinInfo.ilgan}
년주: ${yukchinInfo.year.ganzi} (${yukchinInfo.year.yukchin})
월주: ${yukchinInfo.month.ganzi} (${yukchinInfo.month.yukchin})
일주: ${yukchinInfo.day.ganzi} (일간)
시주: ${yukchinInfo.hour.ganzi} (${yukchinInfo.hour.yukchin})
`.trim();
}
