// 재물운 전문 분석 모듈
import OpenAI from 'openai';
import { analyzeSajuStructure } from './saju-structure';
import { calculateYukchin, analyzeSajuYukchin } from './yukchin';
import { analyzeYearLuck, getYearPillar, getMonthPillar } from './saju-luck';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

interface BirthProfile {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  gender: '남성' | '여성';
}

interface SajuPillars {
  year: string;
  month: string;
  day: string;
  hour: string;
  fullString: string;
}

interface WealthScores {
  overall: number;        // 종합 재물운
  stability: number;      // 재물 안정성 (정재)
  opportunity: number;    // 투자/사업 기회 (편재)
  productivity: number;   // 생산력/창출력 (식상)
  risk: number;          // 손재 위험도 (비겁)
  timing: number;        // 올해 재물 타이밍
}

// 육친별 재물 영향도
const YUKCHIN_WEALTH_IMPACT: Record<string, { type: string; impact: number; desc: string }> = {
  '정재': { type: 'income', impact: 90, desc: '안정적인 수입, 꾸준한 재물 복' },
  '편재': { type: 'opportunity', impact: 85, desc: '큰 돈의 기회, 투자/사업운' },
  '식신': { type: 'productivity', impact: 80, desc: '재물을 만들어내는 생산력' },
  '상관': { type: 'creativity', impact: 75, desc: '창의적 수입원, 변동 가능성' },
  '비견': { type: 'competition', impact: -30, desc: '재물 경쟁, 나눔이 필요' },
  '겁재': { type: 'risk', impact: -50, desc: '손재수 주의, 도난/사기 경계' },
  '정인': { type: 'consume', impact: -20, desc: '학업/자격에 투자, 지출 발생' },
  '편인': { type: 'consume', impact: -25, desc: '예상치 못한 지출, 투자 손실 가능' },
  '정관': { type: 'structure', impact: 20, desc: '재물 관리 능력, 직장 안정' },
  '편관': { type: 'pressure', impact: -15, desc: '외부 압박, 강제 지출 가능' },
};

// 오행별 재물 성향
const ELEMENT_WEALTH_STYLE: Record<string, { style: string; strength: string; weakness: string }> = {
  '목': { style: '성장형', strength: '장기 투자, 사업 확장에 유리', weakness: '급한 수익 추구에 약함' },
  '화': { style: '확산형', strength: '마케팅, 홍보로 돈 버는 능력', weakness: '충동 소비 주의' },
  '토': { style: '축적형', strength: '부동산, 안정 자산에 강함', weakness: '투자 타이밍 늦을 수 있음' },
  '금': { style: '수확형', strength: '결실을 맺는 능력, 현금화에 강함', weakness: '지나친 집착 주의' },
  '수': { style: '유동형', strength: '재테크 감각, 돈의 흐름 파악', weakness: '저축이 어려울 수 있음' },
};

// 재성 유무 분석
function analyzeWealthStars(
  saju: SajuPillars,
): { hasJeongJae: boolean; hasPyeonJae: boolean; positions: string[]; desc: string } {
  const yukchinInfo = analyzeSajuYukchin(saju);
  if (!yukchinInfo) {
    return { hasJeongJae: false, hasPyeonJae: false, positions: [], desc: '분석 불가' };
  }

  const positions: string[] = [];
  let hasJeongJae = false;
  let hasPyeonJae = false;

  const checks = [
    { name: '년주', yukchin: yukchinInfo.year.yukchin },
    { name: '월주', yukchin: yukchinInfo.month.yukchin },
    { name: '시주', yukchin: yukchinInfo.hour.yukchin },
  ];

  for (const check of checks) {
    if (check.yukchin === '정재') {
      hasJeongJae = true;
      positions.push(`${check.name}(정재)`);
    } else if (check.yukchin === '편재') {
      hasPyeonJae = true;
      positions.push(`${check.name}(편재)`);
    }
  }

  let desc = '';
  if (hasJeongJae && hasPyeonJae) {
    desc = '정재+편재 모두 있음 — 안정 수입과 큰 기회 모두 가능한 팔자';
  } else if (hasJeongJae) {
    desc = '정재 있음 — 꾸준하고 안정적인 재물복';
  } else if (hasPyeonJae) {
    desc = '편재 있음 — 큰 돈을 만질 기회가 있는 팔자';
  } else {
    desc = '원국에 재성 없음 — 대운/세운에서 재운이 들어올 때 적극적으로 움직여야';
  }

  return { hasJeongJae, hasPyeonJae, positions, desc };
}

// 식상 분석 (재물 생산력)
function analyzeProductivity(
  saju: SajuPillars,
): { hasSiksang: boolean; type: string; desc: string } {
  const yukchinInfo = analyzeSajuYukchin(saju);
  if (!yukchinInfo) {
    return { hasSiksang: false, type: '없음', desc: '분석 불가' };
  }

  let hasShiksin = false;
  let hasSanggwan = false;

  const checks = [yukchinInfo.year.yukchin, yukchinInfo.month.yukchin, yukchinInfo.hour.yukchin];
  for (const y of checks) {
    if (y === '식신') hasShiksin = true;
    if (y === '상관') hasSanggwan = true;
  }

  if (hasShiksin && hasSanggwan) {
    return { hasSiksang: true, type: '식상혼재', desc: '창의력 + 표현력 모두 강함. 다양한 수입원 가능하지만 일관성 필요' };
  } else if (hasShiksin) {
    return { hasSiksang: true, type: '식신', desc: '안정적 생산력. 기술, 전문직으로 꾸준히 버는 타입' };
  } else if (hasSanggwan) {
    return { hasSiksang: true, type: '상관', desc: '창의적 수익. 프리랜서, 예술, 콘텐츠로 돈 버는 타입' };
  }
  return { hasSiksang: false, type: '없음', desc: '식상 없음 — 재성을 직접 잡아야 함. 영업, 투자에 집중' };
}

// 비겁 분석 (손재 위험)
function analyzeRisk(
  saju: SajuPillars,
): { hasRisk: boolean; level: string; desc: string } {
  const yukchinInfo = analyzeSajuYukchin(saju);
  if (!yukchinInfo) {
    return { hasRisk: false, level: '보통', desc: '분석 불가' };
  }

  let bigyeonCount = 0;
  let geopjaeCount = 0;

  const checks = [yukchinInfo.year.yukchin, yukchinInfo.month.yukchin, yukchinInfo.hour.yukchin];
  for (const y of checks) {
    if (y === '비견') bigyeonCount++;
    if (y === '겁재') geopjaeCount++;
  }

  const totalRisk = bigyeonCount + geopjaeCount * 2;

  if (totalRisk >= 3) {
    return { hasRisk: true, level: '높음', desc: '비겁 과다 — 동업, 보증, 대출 극도로 주의. 혼자 하는 게 안전' };
  } else if (geopjaeCount >= 1) {
    return { hasRisk: true, level: '주의', desc: '겁재 있음 — 손재수 있을 수 있음. 큰 돈 거래 시 신중하게' };
  } else if (bigyeonCount >= 1) {
    return { hasRisk: true, level: '보통', desc: '비견 있음 — 경쟁자 존재. 독점보다 협력이 유리할 수 있음' };
  }
  return { hasRisk: false, level: '낮음', desc: '비겁 없음 — 손재 위험 적음. 과감하게 투자해도 됨' };
}

// 재물운 점수 계산
export function calculateWealthScores(
  saju: SajuPillars,
  currentYear: number,
  currentMonth: number,
): WealthScores {
  const structure = analyzeSajuStructure(saju);
  const wealthStars = analyzeWealthStars(saju);
  const productivity = analyzeProductivity(saju);
  const risk = analyzeRisk(saju);
  const yearLuck = analyzeYearLuck(saju, currentYear, currentMonth);

  // 기본 점수
  let stability = 50;
  let opportunity = 50;
  let productivityScore = 50;
  let riskScore = 50;

  // 재성 분석
  if (wealthStars.hasJeongJae) stability += 30;
  if (wealthStars.hasPyeonJae) opportunity += 30;

  // 식상 분석
  if (productivity.hasSiksang) {
    productivityScore += productivity.type === '식신' ? 25 : 20;
  }

  // 비겁 분석 (위험도가 높을수록 risk 점수 낮음)
  if (risk.level === '높음') riskScore = 30;
  else if (risk.level === '주의') riskScore = 50;
  else if (risk.level === '보통') riskScore = 65;
  else riskScore = 80;

  // 년운 영향 (재성 관련 육친이면 보너스)
  let timing = 50;
  if (yearLuck.yearStemYukchin === '정재' || yearLuck.yearStemYukchin === '편재') {
    timing += 35;
    opportunity += 15;
  } else if (yearLuck.yearStemYukchin === '식신' || yearLuck.yearStemYukchin === '상관') {
    timing += 20;
    productivityScore += 10;
  } else if (yearLuck.yearStemYukchin === '겁재') {
    timing -= 20;
    riskScore -= 15;
  }

  // 지지 충합 영향
  for (const interaction of yearLuck.branchInteractions) {
    if (interaction.type === '합') timing += 10;
    if (interaction.type === '충') timing -= 10;
  }

  // 랜덤 변동 (자연스러움)
  const randomFactor = () => Math.random() * 10 - 5;

  const scores: WealthScores = {
    overall: 0,
    stability: Math.min(100, Math.max(20, stability + randomFactor())),
    opportunity: Math.min(100, Math.max(20, opportunity + randomFactor())),
    productivity: Math.min(100, Math.max(20, productivityScore + randomFactor())),
    risk: Math.min(100, Math.max(20, riskScore + randomFactor())),
    timing: Math.min(100, Math.max(20, timing + randomFactor())),
  };

  // 종합 점수
  scores.overall = Math.round(
    scores.stability * 0.25 +
    scores.opportunity * 0.25 +
    scores.productivity * 0.2 +
    scores.risk * 0.15 +
    scores.timing * 0.15
  );

  return scores;
}

// 점수를 바 차트로 변환
function scoreToBar(score: number, maxBars: number = 10): string {
  const filled = Math.round((score / 100) * maxBars);
  return '█'.repeat(filled) + '░'.repeat(maxBars - filled);
}

// 점수를 레벨로 변환
function scoreToLevel(score: number): string {
  if (score >= 85) return '최상';
  if (score >= 70) return '좋음';
  if (score >= 55) return '보통';
  if (score >= 40) return '주의';
  return '약함';
}

// 시각적 재물운 차트 생성
export function buildWealthChart(
  saju: SajuPillars,
  currentYear: number,
  currentMonth: number,
): string {
  const scores = calculateWealthScores(saju, currentYear, currentMonth);
  const yearPillar = getYearPillar(currentYear);

  const chart = `
*━━━ 💰 재물운 분석 ━━━*

📅 *${currentYear}년 (${yearPillar.ganzi}년)*
\`${saju.fullString}\`

*📊 종합 재물운*
\`┌────────────────────────┐\`
\`│ ${scoreToBar(scores.overall, 16)} ${Math.round(scores.overall)}% │\`
\`└────────────────────────┘\`

*세부 항목*
💵 안정수입   ${scoreToBar(scores.stability)} ${scoreToLevel(scores.stability)}
📈 투자기회   ${scoreToBar(scores.opportunity)} ${scoreToLevel(scores.opportunity)}
🔨 생산력     ${scoreToBar(scores.productivity)} ${scoreToLevel(scores.productivity)}
🛡️ 안전도     ${scoreToBar(scores.risk)} ${scoreToLevel(scores.risk)}
⏰ 올해운     ${scoreToBar(scores.timing)} ${scoreToLevel(scores.timing)}
`.trim();

  return chart;
}

// 재물 유형 분류
export function getWealthType(
  saju: SajuPillars,
): { type: string; emoji: string; desc: string } {
  const structure = analyzeSajuStructure(saju);
  const wealthStars = analyzeWealthStars(saju);
  const productivity = analyzeProductivity(saju);
  const risk = analyzeRisk(saju);
  const dayElement = structure.dayMaster.element;
  const elementStyle = ELEMENT_WEALTH_STYLE[dayElement];

  // 재물 유형 판단
  if (wealthStars.hasJeongJae && wealthStars.hasPyeonJae) {
    return { type: '복합 재물형', emoji: '💎', desc: '안정 + 큰 기회 모두 잡을 수 있는 타입' };
  }
  if (wealthStars.hasPyeonJae && productivity.hasSiksang) {
    return { type: '사업가형', emoji: '🏢', desc: '자기 사업으로 큰 돈 버는 타입' };
  }
  if (wealthStars.hasJeongJae && !risk.hasRisk) {
    return { type: '월급부자형', emoji: '💼', desc: '직장에서 꾸준히 모아 부자 되는 타입' };
  }
  if (wealthStars.hasPyeonJae && risk.level === '높음') {
    return { type: '하이리스크형', emoji: '🎰', desc: '크게 벌 수 있지만 잃을 수도 있는 타입' };
  }
  if (productivity.hasSiksang && productivity.type === '상관') {
    return { type: '크리에이터형', emoji: '🎨', desc: '창작/재능으로 돈 버는 타입' };
  }
  if (productivity.hasSiksang && productivity.type === '식신') {
    return { type: '전문가형', emoji: '🔧', desc: '기술/전문성으로 꾸준히 버는 타입' };
  }
  if (!wealthStars.hasJeongJae && !wealthStars.hasPyeonJae) {
    return { type: '대운의존형', emoji: '🌊', desc: '때를 기다리다 한 번에 터지는 타입' };
  }

  return { type: elementStyle?.style ?? '균형형', emoji: '⚖️', desc: elementStyle?.strength ?? '균형 잡힌 재물운' };
}

// 재물운 질문인지 감지
export function isWealthQuestion(text: string): boolean {
  const patterns = [
    /재물(운|복)?/,
    /돈\s*(운|복|벌|많)/,
    /(부자|재테크|투자|주식|코인|부동산)/,
    /사업\s*(운|시작|할까|해도)/,
    /금전(운|적)?/,
    /월급|연봉|수입/,
    /재정|자산/,
    /돈이\s*(들어|안\s*들어|없|모자)/,
    /부업|창업/,
    /경제적|재산/,
    /올해\s*(돈|재물|투자)/,
  ];
  return patterns.some(p => p.test(text));
}

// 재물운 LLM 분석 생성
export async function generateWealthAnalysis(
  saju: SajuPillars,
  profile: BirthProfile,
  question: string,
): Promise<string> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const structure = analyzeSajuStructure(saju);
  const scores = calculateWealthScores(saju, currentYear, currentMonth);
  const wealthType = getWealthType(saju);
  const chart = buildWealthChart(saju, currentYear, currentMonth);
  const wealthStars = analyzeWealthStars(saju);
  const productivity = analyzeProductivity(saju);
  const risk = analyzeRisk(saju);
  const yearLuck = analyzeYearLuck(saju, currentYear, currentMonth);
  const elementStyle = ELEMENT_WEALTH_STYLE[structure.dayMaster.element];

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    max_completion_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: `너는 경력 20년 사주 재물운 전문가야. 돈에 대해 솔직하고 현실적인 스타일.

## 말투
- 친근한 반말
- "~인 타입이야", "~해야 해" 식으로 단정적
- 돈 얘기는 직접적으로

## 답변 구조 (반드시 이 순서)

[FREE]

*💰 네 재물 체질*
(일간 ${structure.dayMaster.stem}(${structure.dayMaster.element}) 기준 재물 성향 2-3문장)

*📊 원국 재물 구조*
(재성/식상/비겁 분석을 바탕으로 돈 버는 구조 설명)

*⏰ ${currentYear}년 재물 흐름*
(올해 년운이 재물에 미치는 영향. 구체적 시기 언급)

*⚠️ 조심해야 할 것*
(손재수, 사기, 투자 실패 가능성 1-2개)

"근데... 돈 얘기는 여기서부터가 진짜야."

[/FREE]

[PREMIUM]

*🎯 올해 돈 들어오는 정확한 시기*
(월 단위로 구체적인 타이밍 제시)

*💡 너한테 맞는 수입원*
(이 사람에게 최적화된 돈 버는 방법 2-3가지)

*🚫 절대 하면 안 되는 것*
(이 사주가 피해야 할 투자/사업 유형)

*📈 5년 재물 전망*
(대운 흐름 기반 중기 전망)

*💣 숨겨진 재물 변수*
(아무도 모르는 이 사주만의 재물 포인트)

[/PREMIUM]

## 분석 데이터
- 재물 유형: ${wealthType.emoji} ${wealthType.type}
- 재성: ${wealthStars.desc}
- 식상: ${productivity.desc}
- 비겁(손재): ${risk.desc}
- 일간 스타일: ${elementStyle?.style} (${elementStyle?.strength})
- 올해 년운: ${yearLuck.yearPillar.ganzi} (${yearLuck.yearStemYukchin})
- 올해 영향: ${yearLuck.elementImpact}
- 지지 상호작용: ${yearLuck.branchInteractions.map(i => i.description).join(', ') || '특이사항 없음'}

## 포맷
- *볼드* 강조
- 이모지 적절히
- FREE 600자 / PREMIUM 700자
- 반드시 [FREE]...[/FREE]와 [PREMIUM]...[/PREMIUM] 태그 사용`,
      },
      {
        role: 'user',
        content: `[사주 정보]
${profile.year}년 ${profile.month}월 ${profile.day}일 ${profile.hour}시생, ${profile.gender}
사주: ${saju.fullString}
일간: ${structure.dayMaster.element} (${structure.dayMaster.strength.label})

[질문] "${question}"

---
돈에 대해 솔직하게, 현실적으로 분석해줘.`.trim(),
      },
    ],
  });

  const llmResponse = response.choices?.[0]?.message?.content?.trim() ?? '';

  // 차트 + 유형 + LLM 분석 결합
  return `${chart}\n\n${wealthType.emoji} *${wealthType.type}*\n_${wealthType.desc}_\n\n${llmResponse}`;
}
