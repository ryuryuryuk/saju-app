/**
 * 년운/월운 분석 모듈
 * 사용자 원국(natal chart)과 현재 년운/월운의 상호작용을 계산한다.
 * 충(clash), 합(harmony), 형(punishment), 육친(six relations) 분석.
 */

import { calculateYukchin } from './yukchin';

// ── 천간 / 지지 기본 데이터 ──────────────────────────────

const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'] as const;
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'] as const;

const STEM_ELEMENTS: Record<string, string> = {
  '갑': '목', '을': '목', '병': '화', '정': '화', '무': '토',
  '기': '토', '경': '금', '신': '금', '임': '수', '계': '수',
};

const BRANCH_ELEMENTS: Record<string, string> = {
  '자': '수', '축': '토', '인': '목', '묘': '목', '진': '토', '사': '화',
  '오': '화', '미': '토', '신': '금', '유': '금', '술': '토', '해': '수',
};

// ── 지지 충 (六衝) ──────────────────────────────────────

const BRANCH_CLASHES: Record<string, string> = {
  '자': '오', '오': '자', '축': '미', '미': '축',
  '인': '신', '신': '인', '묘': '유', '유': '묘',
  '진': '술', '술': '진', '사': '해', '해': '사',
};

// ── 지지 육합 (六合) ────────────────────────────────────

const BRANCH_COMBINES: Record<string, { partner: string; result: string }> = {
  '자': { partner: '축', result: '토' }, '축': { partner: '자', result: '토' },
  '인': { partner: '해', result: '목' }, '해': { partner: '인', result: '목' },
  '묘': { partner: '술', result: '화' }, '술': { partner: '묘', result: '화' },
  '진': { partner: '유', result: '금' }, '유': { partner: '진', result: '금' },
  '사': { partner: '신', result: '수' }, '신': { partner: '사', result: '수' },
  '오': { partner: '미', result: '토' }, '미': { partner: '오', result: '토' },
};

// ── 지지 형 (刑) ────────────────────────────────────────

const BRANCH_PUNISHMENTS: Record<string, string[]> = {
  '인': ['사', '신'], '사': ['인', '신'], '신': ['인', '사'], // 인사신 삼형
  '축': ['술', '미'], '술': ['축', '미'], '미': ['축', '술'], // 축술미 삼형
  '자': ['묘'], '묘': ['자'], // 자묘 무례지형
};

// ── 육친 의미 ───────────────────────────────────────────

const YUKCHIN_DESCRIPTIONS: Record<string, string> = {
  '비견': '나와 같은 기운 — 경쟁, 독립심, 자존심 강화',
  '겁재': '나와 경쟁하는 기운 — 재물 경쟁, 추진력, 손재수 주의',
  '식신': '내가 낳는 안정된 기운 — 표현력, 의식주 복, 재능 발휘',
  '상관': '내가 낳는 날카로운 기운 — 변화 욕구, 재능 폭발, 기존 질서와 충돌',
  '편재': '유동적 재물의 기운 — 투자·사업 기회, 큰 돈의 흐름',
  '정재': '안정적 재물의 기운 — 꾸준한 수입, 저축, 재무 안정',
  '편관': '나를 압박하는 강한 기운 — 스트레스, 돌발 변동, 외부 압력',
  '정관': '나를 이끄는 바른 기운 — 승진, 명예, 사회적 인정',
  '편인': '나를 돕는 편향된 기운 — 의외의 도움, 직감, 비주류적 관심',
  '정인': '나를 돕는 바른 기운 — 학업, 자격증, 어른의 도움, 안정된 지원',
};

const PILLAR_NAMES: Record<string, string> = {
  year: '년주', month: '월주', day: '일주', hour: '시주',
};

// ── 오행 생극 관계 ──────────────────────────────────────

const CONTROLS: Record<string, string> = { '목': '토', '화': '금', '토': '수', '금': '목', '수': '화' };
const GENERATED_BY: Record<string, string> = { '목': '수', '화': '목', '토': '화', '금': '토', '수': '금' };

// ── 공개 인터페이스 ─────────────────────────────────────

export interface PillarInfo {
  stem: string;
  branch: string;
  ganzi: string;
  stemElement: string;
  branchElement: string;
}

interface BranchInteraction {
  type: '충' | '합' | '형';
  pillarName: string;
  natalBranch: string;
  yearBranch: string;
  description: string;
}

export interface YearLuckAnalysis {
  yearPillar: PillarInfo;
  monthPillar: PillarInfo;
  yearStemYukchin: string;
  yearStemYukchinDesc: string;
  branchInteractions: BranchInteraction[];
  elementImpact: string;
}

// ── 년주 / 월주 계산 ────────────────────────────────────

export function getYearPillar(year: number): PillarInfo {
  const stemIdx = ((year - 4) % 10 + 10) % 10;
  const branchIdx = ((year - 4) % 12 + 12) % 12;
  const stem = STEMS[stemIdx];
  const branch = BRANCHES[branchIdx];
  return {
    stem,
    branch,
    ganzi: `${stem}${branch}`,
    stemElement: STEM_ELEMENTS[stem],
    branchElement: BRANCH_ELEMENTS[branch],
  };
}

/**
 * 연상기월법(年上起月法) 기반 월주 계산.
 * @param month 양력 월 (1~12). 절기 기준 대략 매핑: 2월→인월, 3월→묘월, …, 1월→축월.
 */
export function getMonthPillar(year: number, month: number): PillarInfo {
  const MONTH_STEM_OFFSETS: Record<string, number> = {
    '갑': 2, '기': 2, '을': 4, '경': 4, '병': 6, '신': 6,
    '정': 8, '임': 8, '무': 0, '계': 0,
  };
  const yearStem = STEMS[((year - 4) % 10 + 10) % 10];
  const lunarMonthIdx = ((month - 2 + 12) % 12);
  const monthStemIdx = (MONTH_STEM_OFFSETS[yearStem] + lunarMonthIdx) % 10;
  const monthBranchIdx = (lunarMonthIdx + 2) % 12;
  const stem = STEMS[monthStemIdx];
  const branch = BRANCHES[monthBranchIdx];
  return {
    stem,
    branch,
    ganzi: `${stem}${branch}`,
    stemElement: STEM_ELEMENTS[stem],
    branchElement: BRANCH_ELEMENTS[branch],
  };
}

// ── 년운 상호작용 분석 ──────────────────────────────────

export function analyzeYearLuck(
  saju: { year: string; month: string; day: string; hour: string },
  currentYear: number,
  currentMonth: number,
): YearLuckAnalysis {
  const yearPillar = getYearPillar(currentYear);
  const monthPillar = getMonthPillar(currentYear, currentMonth);

  const dayStem = saju.day[0];
  const dayElement = STEM_ELEMENTS[dayStem];

  // 1) 년운 천간 vs 일간 — 육친 관계
  const yearStemYukchin = calculateYukchin(dayStem, yearPillar.stem) as string;
  const yearStemYukchinDesc = YUKCHIN_DESCRIPTIONS[yearStemYukchin] ?? '';

  // 2) 년운 지지 vs 원국 각 지지 — 충/합/형
  const branchInteractions: BranchInteraction[] = [];
  const natalPillars: Record<string, string> = {
    year: saju.year,
    month: saju.month,
    day: saju.day,
    hour: saju.hour,
  };

  for (const [key, pillarGanzi] of Object.entries(natalPillars)) {
    const natalBranch = pillarGanzi[1];
    if (!natalBranch) continue;

    // 충
    if (BRANCH_CLASHES[yearPillar.branch] === natalBranch) {
      branchInteractions.push({
        type: '충',
        pillarName: PILLAR_NAMES[key],
        natalBranch,
        yearBranch: yearPillar.branch,
        description: `${yearPillar.branch}${natalBranch} 충(衝) — 큰 변동, 이동, 기존 것이 흔들리고 새 변화가 밀려옴`,
      });
    }

    // 합
    const combineInfo = BRANCH_COMBINES[yearPillar.branch];
    if (combineInfo && combineInfo.partner === natalBranch) {
      branchInteractions.push({
        type: '합',
        pillarName: PILLAR_NAMES[key],
        natalBranch,
        yearBranch: yearPillar.branch,
        description: `${yearPillar.branch}${natalBranch} 합(合→${combineInfo.result}) — 조화, 새 인연, 기회가 자연스럽게 열림`,
      });
    }

    // 형
    const punishPartners = BRANCH_PUNISHMENTS[yearPillar.branch];
    if (punishPartners && punishPartners.includes(natalBranch)) {
      branchInteractions.push({
        type: '형',
        pillarName: PILLAR_NAMES[key],
        natalBranch,
        yearBranch: yearPillar.branch,
        description: `${yearPillar.branch}${natalBranch} 형(刑) — 마찰, 갈등, 건강·관계 스트레스 주의`,
      });
    }
  }

  // 3) 오행 영향 — 년운 오행이 일간에 미치는 영향
  const yearElement = yearPillar.stemElement;
  let elementImpact = '';

  if (yearElement === dayElement) {
    elementImpact = `올해 ${yearElement} 기운 유입(비겁) — 자기 힘 강화, 독립심·경쟁심 증가. 주도적으로 움직이는 해.`;
  } else if (GENERATED_BY[dayElement] === yearElement) {
    elementImpact = `올해 ${yearElement} 기운이 일간 ${dayElement}을(를) 생(生)해줌(인성) — 도움, 학업, 자격, 귀인이 들어오는 해.`;
  } else if (GENERATED_BY[yearElement] === dayElement) {
    elementImpact = `일간 ${dayElement}이(가) 올해 ${yearElement} 기운을 생(生)함(식상) — 표현·창작 에너지 폭발, 하고 싶은 게 많아지는 해.`;
  } else if (CONTROLS[yearElement] === dayElement) {
    elementImpact = `올해 ${yearElement} 기운이 일간 ${dayElement}을(를) 극(剋)함(관살) — 외부 압박, 변화 강요, 시험대에 오르는 해.`;
  } else if (CONTROLS[dayElement] === yearElement) {
    elementImpact = `일간 ${dayElement}이(가) 올해 ${yearElement} 기운을 극(剋)함(재성) — 재물·기회를 잡으러 적극적으로 나서는 해.`;
  }

  return {
    yearPillar,
    monthPillar,
    yearStemYukchin,
    yearStemYukchinDesc,
    branchInteractions,
    elementImpact,
  };
}

// ── 포맷팅 ──────────────────────────────────────────────

export function formatYearLuckText(analysis: YearLuckAnalysis, dayStem: string): string {
  const dayElement = STEM_ELEMENTS[dayStem] ?? '미상';
  const lines: string[] = [];

  lines.push(`[년운 분석 — ${analysis.yearPillar.ganzi}년(${analysis.yearPillar.stemElement}+${analysis.yearPillar.branchElement})]`);
  lines.push(`일간 '${dayStem}'(${dayElement}) 기준:`);
  lines.push(`• 년운 천간 '${analysis.yearPillar.stem}'(${analysis.yearPillar.stemElement}) = ${analysis.yearStemYukchin}`);
  lines.push(`  → ${analysis.yearStemYukchinDesc}`);
  lines.push(`• 오행 영향: ${analysis.elementImpact}`);
  lines.push('');

  if (analysis.branchInteractions.length > 0) {
    lines.push(`[지지 상호작용 — 올해의 핵심 변수]`);
    for (const i of analysis.branchInteractions) {
      lines.push(`• ${i.pillarName}의 '${i.natalBranch}'와 년운 '${i.yearBranch}': ${i.type} — ${i.description}`);
    }
  } else {
    lines.push(`[지지 상호작용]`);
    lines.push(`년운 '${analysis.yearPillar.branch}'와 원국 지지 간 충/합/형 없음 — 비교적 안정적 흐름.`);
  }

  lines.push('');
  lines.push(`[이번 달 월운: ${analysis.monthPillar.ganzi}(${analysis.monthPillar.stemElement}+${analysis.monthPillar.branchElement})]`);

  return lines.join('\n');
}
