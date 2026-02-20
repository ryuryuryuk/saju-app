// 궁합 분석 모듈
import OpenAI from 'openai';
import { analyzeSajuStructure } from './saju-structure';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

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

interface CompatibilityScores {
  overall: number;      // 전체 궁합
  emotion: number;      // 감정적 궁합
  communication: number; // 소통
  財: number;           // 재물 궁합
  attraction: number;   // 끌림/케미
  longTerm: number;     // 장기 전망
}

// 오행 상생상극 관계
const ELEMENT_GENERATES: Record<string, string> = {
  '목': '화', '화': '토', '토': '금', '금': '수', '수': '목',
};

const ELEMENT_CONTROLS: Record<string, string> = {
  '목': '토', '화': '금', '토': '수', '금': '목', '수': '화',
};

// 지지 충 관계
const BRANCH_CLASH: Record<string, string> = {
  '자': '오', '오': '자',
  '축': '미', '미': '축',
  '인': '신', '신': '인',
  '묘': '유', '유': '묘',
  '진': '술', '술': '진',
  '사': '해', '해': '사',
};

// 지지 합 관계 (육합)
const BRANCH_COMBINE: Record<string, string> = {
  '자': '축', '축': '자',
  '인': '해', '해': '인',
  '묘': '술', '술': '묘',
  '진': '유', '유': '진',
  '사': '신', '신': '사',
  '오': '미', '미': '오',
};

// 일간 관계 분석
function analyzeDayMasterRelation(
  element1: string,
  element2: string,
): { type: string; score: number; desc: string } {
  if (element1 === element2) {
    return { type: '비화', score: 70, desc: '같은 기운이라 이해는 잘 되지만, 경쟁 구도가 될 수 있어요' };
  }
  if (ELEMENT_GENERATES[element1] === element2) {
    return { type: '상생(내가 생)', score: 85, desc: '내가 상대를 돌봐주는 관계예요. 헌신형' };
  }
  if (ELEMENT_GENERATES[element2] === element1) {
    return { type: '상생(상대가 생)', score: 90, desc: '상대가 나를 돌봐줘요. 받는 사랑' };
  }
  if (ELEMENT_CONTROLS[element1] === element2) {
    return { type: '상극(내가 극)', score: 60, desc: '내가 상대를 컨트롤하려 해요. 주도권 쟁탈' };
  }
  if (ELEMENT_CONTROLS[element2] === element1) {
    return { type: '상극(상대가 극)', score: 55, desc: '상대에게 눌리는 느낌이 있어요. 긴장 관계' };
  }
  return { type: '무관', score: 65, desc: '직접적 연결은 약하지만, 다른 요소로 보완 가능' };
}

// 지지 충합 분석
function analyzeBranchInteractions(
  branches1: string[],
  branches2: string[],
): { clashes: string[]; combines: string[]; score: number } {
  const clashes: string[] = [];
  const combines: string[] = [];

  for (const b1 of branches1) {
    for (const b2 of branches2) {
      if (BRANCH_CLASH[b1] === b2) {
        clashes.push(`${b1}-${b2} 충`);
      }
      if (BRANCH_COMBINE[b1] === b2) {
        combines.push(`${b1}-${b2} 합`);
      }
    }
  }

  // 합이 많으면 +, 충이 많으면 -
  const score = 70 + (combines.length * 8) - (clashes.length * 12);
  return { clashes, combines, score: Math.max(20, Math.min(100, score)) };
}

// 오행 보완 분석
function analyzeElementComplement(
  elements1: Record<string, number>,
  elements2: Record<string, number>,
): { complement: boolean; score: number; desc: string } {
  const keys = ['목', '화', '토', '금', '수'];
  let complementCount = 0;

  for (const key of keys) {
    const v1 = elements1[key] || 0;
    const v2 = elements2[key] || 0;
    // 한쪽이 부족(0-1)하고 다른쪽이 많으면(2+) 보완
    if ((v1 <= 1 && v2 >= 2) || (v2 <= 1 && v1 >= 2)) {
      complementCount++;
    }
  }

  if (complementCount >= 2) {
    return { complement: true, score: 90, desc: '서로 부족한 부분을 채워주는 좋은 조합이에요' };
  } else if (complementCount === 1) {
    return { complement: true, score: 75, desc: '일부 보완되는 부분이 있어요' };
  }
  return { complement: false, score: 60, desc: '오행 보완은 약한 편이에요' };
}

// 궁합 점수 계산
export function calculateCompatibility(
  saju1: SajuPillars,
  saju2: SajuPillars,
): CompatibilityScores {
  const structure1 = analyzeSajuStructure(saju1);
  const structure2 = analyzeSajuStructure(saju2);

  // 일간 관계
  const dayMasterRelation = analyzeDayMasterRelation(
    structure1.dayMaster.element,
    structure2.dayMaster.element,
  );

  // 지지 분석
  const branches1 = [
    saju1.year[1], saju1.month[1], saju1.day[1], saju1.hour[1],
  ].filter(Boolean);
  const branches2 = [
    saju2.year[1], saju2.month[1], saju2.day[1], saju2.hour[1],
  ].filter(Boolean);
  const branchAnalysis = analyzeBranchInteractions(branches1, branches2);

  // 오행 보완
  const elementComplement = analyzeElementComplement(
    structure1.fiveElements,
    structure2.fiveElements,
  );

  // 점수 계산
  const overall = Math.round(
    (dayMasterRelation.score * 0.35) +
    (branchAnalysis.score * 0.25) +
    (elementComplement.score * 0.25) +
    (Math.random() * 15 + 70) * 0.15 // 약간의 변동성
  );

  return {
    overall: Math.min(95, Math.max(40, overall)),
    emotion: Math.min(100, Math.max(30, dayMasterRelation.score + (Math.random() * 10 - 5))),
    communication: Math.min(100, Math.max(30, branchAnalysis.score + (Math.random() * 10 - 5))),
    財: Math.min(100, Math.max(30, elementComplement.score + (Math.random() * 15 - 7))),
    attraction: Math.min(100, Math.max(40, 60 + (branchAnalysis.combines.length * 10) + (Math.random() * 20))),
    longTerm: Math.min(100, Math.max(30, overall - 5 + (Math.random() * 10 - 5))),
  };
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
  return '어려움';
}

// 시각적 궁합 차트 생성
export function buildCompatibilityChart(
  saju1: SajuPillars,
  saju2: SajuPillars,
  name1: string = '나',
  name2: string = '상대',
): string {
  const scores = calculateCompatibility(saju1, saju2);

  const chart = `
*━━━ 💕 궁합 분석 ━━━*

👤 *${name1}*          ❤️          👤 *${name2}*
\`${saju1.fullString}\`     \`${saju2.fullString}\`

*📊 종합 궁합 점수*
\`┌────────────────────────┐\`
\`│ ${scoreToBar(scores.overall, 16)} ${scores.overall}% │\`
\`└────────────────────────┘\`

*세부 항목*
💓 감정     ${scoreToBar(scores.emotion)} ${scoreToLevel(scores.emotion)}
🗣️ 소통     ${scoreToBar(scores.communication)} ${scoreToLevel(scores.communication)}
💰 재물     ${scoreToBar(scores.財)} ${scoreToLevel(scores.財)}
🔥 끌림     ${scoreToBar(scores.attraction)} ${scoreToLevel(scores.attraction)}
📅 장기     ${scoreToBar(scores.longTerm)} ${scoreToLevel(scores.longTerm)}
`.trim();

  return chart;
}

// 궁합 유형 분류
export function getCompatibilityType(scores: CompatibilityScores): { type: string; emoji: string; desc: string } {
  if (scores.attraction >= 85 && scores.emotion >= 75) {
    return { type: '불꽃 커플', emoji: '🔥', desc: '강렬한 끌림! 열정적인 관계' };
  }
  if (scores.longTerm >= 80 && scores.communication >= 75) {
    return { type: '안정 커플', emoji: '🏠', desc: '오래가는 관계. 결혼 궁합 좋음' };
  }
  if (scores.attraction >= 70 && scores.longTerm < 60) {
    return { type: '불꽃 주의', emoji: '⚡', desc: '끌림은 강하지만 장기적으론 노력 필요' };
  }
  if (scores.emotion >= 80 && scores.財 >= 75) {
    return { type: '동반자형', emoji: '🤝', desc: '감정+재물 모두 좋은 파트너' };
  }
  if (scores.overall >= 70) {
    return { type: '좋은 인연', emoji: '💫', desc: '전반적으로 좋은 궁합' };
  }
  if (scores.overall >= 55) {
    return { type: '노력형 커플', emoji: '💪', desc: '서로 맞춰가면 잘 될 수 있어요' };
  }
  return { type: '조심 필요', emoji: '⚠️', desc: '갈등 요소가 많아요. 신중하게' };
}

// 궁합 LLM 분석 생성
export async function generateCompatibilityAnalysis(
  saju1: SajuPillars,
  saju2: SajuPillars,
  profile1: BirthProfile,
  profile2: BirthProfile,
  question: string,
): Promise<string> {
  const structure1 = analyzeSajuStructure(saju1);
  const structure2 = analyzeSajuStructure(saju2);
  const scores = calculateCompatibility(saju1, saju2);
  const compatType = getCompatibilityType(scores);
  const chart = buildCompatibilityChart(saju1, saju2);

  // 일간 관계 분석
  const dayMasterRelation = analyzeDayMasterRelation(
    structure1.dayMaster.element,
    structure2.dayMaster.element,
  );

  // 지지 충합
  const branches1 = [saju1.year[1], saju1.month[1], saju1.day[1], saju1.hour[1]].filter(Boolean);
  const branches2 = [saju2.year[1], saju2.month[1], saju2.day[1], saju2.hour[1]].filter(Boolean);
  const branchAnalysis = analyzeBranchInteractions(branches1, branches2);

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.75,
    max_completion_tokens: 1200,
    messages: [
      {
        role: 'system',
        content: `너는 경력 20년 사주 궁합 전문가야. 두 사람의 사주를 비교 분석해서 궁합을 풀이해줘.

## 말투
- 사용자 말투 따라가기 (존댓말이면 존댓말, 반말이면 반말)
- 친근하지만 전문가 느낌
- GPT 티 안 나게

## 답변 구조
1. *케미 분석* — 두 사람이 만나면 어떤 에너지가 생기는지
2. *끌림 포인트* — 서로 어디에 끌리는지
3. *주의할 점* — 이 관계에서 조심해야 할 것
4. *장기 전망* — 오래가려면 어떻게 해야 하는지
5. *핵심 조언* — 상대 다루는 법 한 가지

## 분석 데이터
- 궁합 유형: ${compatType.emoji} ${compatType.type} (${compatType.desc})
- 일간 관계: ${dayMasterRelation.type} (${dayMasterRelation.desc})
- 지지 충: ${branchAnalysis.clashes.length > 0 ? branchAnalysis.clashes.join(', ') : '없음'}
- 지지 합: ${branchAnalysis.combines.length > 0 ? branchAnalysis.combines.join(', ') : '없음'}
- 점수: 감정 ${Math.round(scores.emotion)}%, 끌림 ${Math.round(scores.attraction)}%, 장기 ${Math.round(scores.longTerm)}%

## 포맷
- *볼드*로 핵심 강조
- 이모지 2-3개
- 800자 이내
- 태그 없이 자연스럽게`,
      },
      {
        role: 'user',
        content: `[나의 사주]
${profile1.year}년 ${profile1.month}월 ${profile1.day}일 ${profile1.hour}시생, ${profile1.gender}
사주: ${saju1.fullString}
일간: ${structure1.dayMaster.element}

[상대 사주]
${profile2.year}년 ${profile2.month}월 ${profile2.day}일 ${profile2.hour}시생, ${profile2.gender}
사주: ${saju2.fullString}
일간: ${structure2.dayMaster.element}

[질문]
"${question}"

---
이 두 사람의 궁합을 분석해줘.`.trim(),
      },
    ],
  });

  const llmResponse = response.choices?.[0]?.message?.content?.trim() ?? '';

  // 차트 (시각정보) + 궁합 유형 + LLM 분석 결합
  return `${chart}\n\n${compatType.emoji} *${compatType.type}*\n_${compatType.desc}_\n\n${llmResponse}`;
}

// 궁합 질문인지 감지
export function isCompatibilityQuestion(text: string): boolean {
  const patterns = [
    /궁합/,
    /어울려|어울리/,
    /(그|저|이)\s*(사람|분|애|녀석|남자|여자).*맞아/,
    /(그|저|이)\s*(사람|분|애|녀석|남자|여자).*(사귀|결혼|연애)/,
    /우리\s*(둘|관계)/,
    /상대방.*사주/,
    /두\s*사람/,
    /연인.*맞/,
    /커플/,
  ];
  return patterns.some(p => p.test(text));
}

// 상대방 프로필 요청 메시지
export function getPartnerProfileRequest(): string {
  return `💕 *궁합 분석을 시작할게요!*

상대방의 생년월일시와 성별을 알려주세요.

예시: 1995년 3월 15일 오후 2시 남성

(태어난 시간 모르면 "시간 모름"이라고 보내줘요)`;
}
