/**
 * 대운(大運) 계산 모듈.
 * 10년 단위의 대운을 계산하여 인생의 큰 흐름을 분석한다.
 * 
 * 대운 계산법:
 * - 남양(남자+양간 or 여자+음간): 순행 (다음 절기까지 날짜수 / 3 = 대운 시작 나이)
 * - 남음(남자+음간 or 여자+양간): 역행 (이전 절기까지 날짜수 / 3 = 대운 시작 나이)
 */

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

// 양간 (짝수 index)
function isYangStem(stem: string): boolean {
  const idx = STEMS.indexOf(stem as typeof STEMS[number]);
  return idx >= 0 && idx % 2 === 0;
}

export interface DaewoonPillar {
  stem: string;
  branch: string;
  ganzi: string;
  stemElement: string;
  branchElement: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
}

export interface DaewoonAnalysis {
  pillars: DaewoonPillar[];
  currentDaewoon: DaewoonPillar | null;
  currentIndex: number;
  direction: 'forward' | 'backward';
  startAge: number;
}

/**
 * 대운 계산 (간략화 버전).
 * 정밀한 절기 계산 대신 월주 기반 순행/역행으로 대운 기둥을 산출한다.
 * 대운 시작 나이는 간략하게 3세부터 시작하는 것으로 처리한다 (정밀 계산은 절기 API 필요).
 */
export function calculateDaewoon(
  monthStem: string,
  monthBranch: string,
  yearStem: string,
  gender: '남성' | '여성',
  birthYear: number,
): DaewoonAnalysis {
  const isYang = isYangStem(yearStem);
  const isMale = gender === '남성';
  
  // 순행: 남양 or 여음 / 역행: 남음 or 여양
  const isForward = (isMale && isYang) || (!isMale && !isYang);
  const direction = isForward ? 'forward' : 'backward';

  // 대운 시작 나이 (간략화: 3세 기본값)
  const startAge = 3;

  const monthStemIdx = STEMS.indexOf(monthStem as typeof STEMS[number]);
  const monthBranchIdx = BRANCHES.indexOf(monthBranch as typeof BRANCHES[number]);

  const pillars: DaewoonPillar[] = [];

  for (let i = 1; i <= 8; i++) {
    const step = isForward ? i : -i;
    let stemIdx = (monthStemIdx + step) % 10;
    let branchIdx = (monthBranchIdx + step) % 12;
    if (stemIdx < 0) stemIdx += 10;
    if (branchIdx < 0) branchIdx += 12;

    const stem = STEMS[stemIdx];
    const branch = BRANCHES[branchIdx];
    const pillarStartAge = startAge + (i - 1) * 10;
    const pillarEndAge = pillarStartAge + 9;

    pillars.push({
      stem,
      branch,
      ganzi: `${stem}${branch}`,
      stemElement: STEM_ELEMENTS[stem],
      branchElement: BRANCH_ELEMENTS[branch],
      startAge: pillarStartAge,
      endAge: pillarEndAge,
      startYear: birthYear + pillarStartAge,
      endYear: birthYear + pillarEndAge,
    });
  }

  // 현재 나이 계산
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - birthYear + 1; // 한국 나이
  let currentDaewoon: DaewoonPillar | null = null;
  let currentIndex = -1;

  for (let i = 0; i < pillars.length; i++) {
    if (currentAge >= pillars[i].startAge && currentAge <= pillars[i].endAge) {
      currentDaewoon = pillars[i];
      currentIndex = i;
      break;
    }
  }

  return { pillars, currentDaewoon, currentIndex, direction, startAge };
}

/**
 * 대운 분석 텍스트 생성.
 * 현재 대운과 다음 대운을 중심으로 분석 데이터를 포맷팅한다.
 */
export function formatDaewoonText(
  analysis: DaewoonAnalysis,
  dayStem: string,
): string {
  const dayElement = STEM_ELEMENTS[dayStem] ?? '';
  const lines: string[] = [];

  lines.push(`[대운 분석 — ${analysis.direction === 'forward' ? '순행' : '역행'}]`);
  lines.push('');

  // 전체 대운 타임라인
  lines.push('대운 흐름:');
  for (let i = 0; i < analysis.pillars.length; i++) {
    const p = analysis.pillars[i];
    const isCurrent = i === analysis.currentIndex;
    const marker = isCurrent ? '👉 ' : '   ';
    lines.push(`${marker}${p.startAge}~${p.endAge}세 (${p.startYear}~${p.endYear}): ${p.ganzi} (${p.stemElement}/${p.branchElement})${isCurrent ? ' ← 현재' : ''}`);
  }

  if (analysis.currentDaewoon) {
    const cur = analysis.currentDaewoon;
    lines.push('');
    lines.push(`[현재 대운: ${cur.ganzi} (${cur.stemElement}/${cur.branchElement})]`);
    lines.push(`일간 '${dayStem}'(${dayElement}) 기준:`);
    lines.push(`• 대운 천간 '${cur.stem}'(${cur.stemElement}) 영향`);
    lines.push(`• 대운 지지 '${cur.branch}'(${cur.branchElement}) 영향`);
    lines.push(`• 기간: ${cur.startAge}세 ~ ${cur.endAge}세 (${cur.startYear}~${cur.endYear}년)`);

    // 다음 대운 미리보기
    if (analysis.currentIndex >= 0 && analysis.currentIndex < analysis.pillars.length - 1) {
      const next = analysis.pillars[analysis.currentIndex + 1];
      lines.push('');
      lines.push(`[다음 대운: ${next.ganzi} (${next.stemElement}/${next.branchElement})]`);
      lines.push(`전환 시점: ${next.startYear}년 (${next.startAge}세)`);
    }
  }

  return lines.join('\n');
}
