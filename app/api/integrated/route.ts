import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { analyzeSajuStructure } from '@/lib/saju-structure';
import { analyzeSajuYukchin, formatYukchinString } from '@/lib/yukchin';
import { sanitizeText } from '@/lib/upload-validation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const VISION_MODEL = 'gpt-4o';
const MAX_TEXT_LENGTH = 500_000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif']);

const DISCLAIMER =
  '본 분석은 전통 명리학 및 심리 분석 관점의 참고용 콘텐츠이며, 의학적 · 과학적 · 법적 근거가 있는 진단이 아닙니다. 중요한 의사결정은 전문가 상담을 병행하세요.';

// ---------------------------------------------------------------------------
// Pillar normalization (한자 → 한글)
// ---------------------------------------------------------------------------

const STEM_ALIASES: Record<string, string> = {
  갑: '갑', 을: '을', 병: '병', 정: '정', 무: '무', 기: '기', 경: '경', 신: '신', 임: '임', 계: '계',
  甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계',
};

const BRANCH_ALIASES: Record<string, string> = {
  자: '자', 축: '축', 인: '인', 묘: '묘', 진: '진', 사: '사', 오: '오', 미: '미', 신: '신', 유: '유', 술: '술', 해: '해',
  子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedMessage {
  sender: string;
  text: string;
  timestamp?: string;
}

interface ChatStats {
  totalMessages: number;
  s1Name: string;
  s2Name: string;
  s1Count: number;
  s2Count: number;
  s1AvgLength: number;
  s2AvgLength: number;
  initiationRate: { you: number; partner: number };
}

interface SajuPillars {
  year: string;
  month: string;
  day: string;
  hour: string;
  fullString: string;
}

interface IntegratedReport {
  executiveSummary: {
    diagnosis: string;
    scores: {
      balance: number;
      emotionalSafety: number;
      repairAbility: number;
      investment: number;
      attachmentLoop: number;
      futureAlignment: number;
    };
    scoreExplanations: {
      balance: string;
      emotionalSafety: string;
      repairAbility: string;
      investment: string;
      attachmentLoop: string;
      futureAlignment: string;
    };
    risks: string[];
    opportunities: string[];
    actions48h: string[];
  };
  deepDive: Array<{
    claim: string;
    evidence: string;
    interpretation: string;
    action: string;
  }>;
  actionPlan: {
    hours48: string[];
    week1: string[];
    week4: string[];
    scripts: {
      apology: string;
      boundary: string;
      request: string;
      repair: string;
      closure: string;
    };
  };
  concernResponse: {
    question: string;
    scenarios: {
      optimistic: { conditions: string; evidence: string; actions: string };
      neutral: { conditions: string; evidence: string; actions: string };
      pessimistic: { conditions: string; evidence: string; actions: string };
    };
  };
  sajuSummary: string;
  dataSources: string[];
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Helper: External saju API call
// ---------------------------------------------------------------------------

async function calculateSajuFromAPI(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  gender: string,
): Promise<SajuPillars> {
  const { calculateSajuWithFallback } = await import('@/lib/saju-api-fallback');
  return calculateSajuWithFallback({
    year,
    month,
    day,
    hour,
    minute: minute ?? '0',
    gender: gender === '여성' ? '여성' : '남성',
  });
}

// ---------------------------------------------------------------------------
// Helper: Normalize a single pillar (한자 → 한글, whitespace cleanup)
// ---------------------------------------------------------------------------

function normalizePillar(rawValue: string): string {
  const cleaned = (rawValue ?? '').trim().replace(/\s+/g, '');
  if (!cleaned) return '';

  const chars = [...cleaned];
  let stem: string | null = null;
  let branch: string | null = null;

  for (const ch of chars) {
    if (!stem && STEM_ALIASES[ch]) {
      stem = STEM_ALIASES[ch];
      continue;
    }
    if (stem && !branch && BRANCH_ALIASES[ch]) {
      branch = BRANCH_ALIASES[ch];
      break;
    }
  }

  if (!stem || !branch) {
    throw new Error(`천간/지지 파싱 실패 (받은 값: "${rawValue}")`);
  }

  return `${stem}${branch}`;
}

function normalizeAllPillars(saju: SajuPillars): SajuPillars {
  const normalized: SajuPillars = {
    year: normalizePillar(saju.year),
    month: normalizePillar(saju.month),
    day: normalizePillar(saju.day),
    hour: normalizePillar(saju.hour),
    fullString: '',
  };
  normalized.fullString = `${normalized.year}년 ${normalized.month}월 ${normalized.day}일 ${normalized.hour}시`;
  return normalized;
}

// ---------------------------------------------------------------------------
// Helper: KakaoTalk parser
// ---------------------------------------------------------------------------

function parseKakaoTalk(raw: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const lines = raw.split('\n');

  const mobilePattern = /^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}:\d{2})\]\s*(.+)$/;
  const pcPattern = /^(.+?)\s*:\s*(.+)$/;
  const newPattern = /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*(오전|오후)\s*\d{1,2}:\d{2},\s*(.+?)\s*:\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let match = mobilePattern.exec(trimmed);
    if (match) {
      messages.push({ sender: match[1], text: match[4], timestamp: `${match[2]} ${match[3]}` });
      continue;
    }

    match = newPattern.exec(trimmed);
    if (match) {
      messages.push({ sender: match[2], text: match[3] });
      continue;
    }

    match = pcPattern.exec(trimmed);
    if (match && match[1].length < 30) {
      messages.push({ sender: match[1], text: match[2] });
    }
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Helper: Anonymize senders
// ---------------------------------------------------------------------------

function anonymizeMessages(messages: ParsedMessage[]): ParsedMessage[] {
  const senders = [...new Set(messages.map((m) => m.sender))];
  const map: Record<string, string> = {};
  senders.forEach((s, i) => {
    map[s] = i === 0 ? '나' : i === 1 ? '상대방' : `참여자${i + 1}`;
  });
  return messages.map((m) => ({ ...m, sender: map[m.sender] ?? m.sender }));
}

// ---------------------------------------------------------------------------
// Helper: Compute message stats
// ---------------------------------------------------------------------------

function computeStats(messages: ParsedMessage[]): ChatStats {
  const senders = [...new Set(messages.map((m) => m.sender))];
  const s1 = senders[0] ?? '나';
  const s2 = senders[1] ?? '상대방';

  const s1Msgs = messages.filter((m) => m.sender === s1);
  const s2Msgs = messages.filter((m) => m.sender === s2);

  let s1First = 0;
  let s2First = 0;
  let prevSender = '';
  for (const m of messages) {
    if (m.sender !== prevSender) {
      if (m.sender === s1) s1First++;
      else if (m.sender === s2) s2First++;
    }
    prevSender = m.sender;
  }
  const firstTotal = (s1First + s2First) || 1;

  return {
    totalMessages: messages.length,
    s1Name: s1,
    s2Name: s2,
    s1Count: s1Msgs.length,
    s2Count: s2Msgs.length,
    s1AvgLength: s1Msgs.length
      ? Math.round(s1Msgs.reduce((a, m) => a + m.text.length, 0) / s1Msgs.length)
      : 0,
    s2AvgLength: s2Msgs.length
      ? Math.round(s2Msgs.reduce((a, m) => a + m.text.length, 0) / s2Msgs.length)
      : 0,
    initiationRate: {
      you: +(s1First / firstTotal).toFixed(2),
      partner: +(s2First / firstTotal).toFixed(2),
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: Extract user messages from AI chat log
// ---------------------------------------------------------------------------

function extractUserMessages(raw: string): string[] {
  const lines = raw.split('\n');
  const userMessages: string[] = [];

  // Try JSON format first (ChatGPT export)
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.role === 'user' || item.author?.role === 'user') {
          const content =
            typeof item.content === 'string'
              ? item.content
              : item.content?.parts?.join('\n') ?? '';
          if (content.trim()) userMessages.push(content.trim());
        }
      }
      if (userMessages.length > 0) return userMessages;
    }
  } catch {
    // Not JSON — fall through to text patterns
  }

  // Text patterns
  const prefixes = /^(You|User|Human|나|사용자)\s*[:：]\s*/i;
  let currentMsg = '';
  let isUserMsg = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (isUserMsg && currentMsg) {
        userMessages.push(currentMsg.trim());
        currentMsg = '';
        isUserMsg = false;
      }
      continue;
    }

    if (prefixes.test(trimmed)) {
      if (isUserMsg && currentMsg) {
        userMessages.push(currentMsg.trim());
      }
      currentMsg = trimmed.replace(prefixes, '');
      isUserMsg = true;
    } else if (/^(Assistant|ChatGPT|Claude|AI|GPT|System)\s*[:：]/i.test(trimmed)) {
      if (isUserMsg && currentMsg) {
        userMessages.push(currentMsg.trim());
        currentMsg = '';
      }
      isUserMsg = false;
    } else if (isUserMsg) {
      currentMsg += '\n' + trimmed;
    }
  }

  if (isUserMsg && currentMsg) {
    userMessages.push(currentMsg.trim());
  }

  // Fallback: treat all non-empty lines as user messages
  if (userMessages.length === 0) {
    return lines.filter((l) => l.trim().length > 0).map((l) => l.trim());
  }

  return userMessages;
}

// ---------------------------------------------------------------------------
// Helper: Safely parse JSON from GPT response
// ---------------------------------------------------------------------------

function safeParseJSON<T>(raw: string): T | null {
  // Attempt 1: direct parse
  try {
    return JSON.parse(raw) as T;
  } catch {
    // continue
  }

  // Attempt 2: regex extraction of first {...}
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
  } catch {
    // continue
  }

  return null;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // ------------------------------------------------------------------
    // 1. Parse multipart FormData
    // ------------------------------------------------------------------
    const formData = await request.formData();

    const birthYear = formData.get('birthYear') as string | null;
    const birthMonth = formData.get('birthMonth') as string | null;
    const birthDay = formData.get('birthDay') as string | null;
    const birthHour = formData.get('birthHour') as string | null;
    const birthMinute = (formData.get('birthMinute') as string | null) ?? '0';
    const gender = (formData.get('gender') as string | null) ?? '남성';
    const question = (formData.get('question') as string | null) ?? '';

    const kakaoText = formData.get('kakaoText') as string | null;
    const aiChatText = formData.get('aiChatText') as string | null;
    const faceImage = formData.get('faceImage') as File | null;
    const faceConsent = formData.get('faceConsent') as string | null;

    // ------------------------------------------------------------------
    // 2. Validate required saju fields
    // ------------------------------------------------------------------
    if (!birthYear || !birthMonth || !birthDay || !birthHour) {
      return NextResponse.json(
        { success: false, error: '생년월일시는 필수 입력값입니다.' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Saju calculation + structure/yukchin analysis
    // ------------------------------------------------------------------
    const rawSaju = await calculateSajuFromAPI(
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      birthMinute,
      gender,
    );
    const saju = normalizeAllPillars(rawSaju);
    const sajuStructure = analyzeSajuStructure(saju);
    const yukchinInfo = analyzeSajuYukchin(saju);
    const yukchinString = formatYukchinString(yukchinInfo);

    const dataSources: string[] = ['saju'];

    // ------------------------------------------------------------------
    // 4. Parse KakaoTalk text (optional)
    // ------------------------------------------------------------------
    let kakaoContext = '';
    let kakaoStats: ChatStats | null = null;

    if (kakaoText && kakaoText.trim().length > 0) {
      if (kakaoText.length > MAX_TEXT_LENGTH) {
        return NextResponse.json(
          { success: false, error: '카카오톡 대화 텍스트가 너무 깁니다 (최대 50만자).' },
          { status: 400 },
        );
      }

      const sanitized = sanitizeText(kakaoText);
      let messages = parseKakaoTalk(sanitized);

      if (messages.length >= 5) {
        messages = anonymizeMessages(messages);
        kakaoStats = computeStats(messages);

        const sample = messages
          .slice(0, 200)
          .map((m) => `${m.sender}: ${m.text}`)
          .join('\n');

        kakaoContext = `
[카카오톡 대화 분석 데이터]
총 메시지: ${kakaoStats.totalMessages}개
${kakaoStats.s1Name}: ${kakaoStats.s1Count}개 (평균 ${kakaoStats.s1AvgLength}자)
${kakaoStats.s2Name}: ${kakaoStats.s2Count}개 (평균 ${kakaoStats.s2AvgLength}자)
대화 시작 비율: ${kakaoStats.s1Name} ${Math.round(kakaoStats.initiationRate.you * 100)}% / ${kakaoStats.s2Name} ${Math.round(kakaoStats.initiationRate.partner * 100)}%

대화 샘플 (최대 200개):
${sample}
`;
        dataSources.push('kakaoTalk');
      }
    }

    // ------------------------------------------------------------------
    // 5. Extract AI chat messages (optional)
    // ------------------------------------------------------------------
    let aiChatContext = '';

    if (aiChatText && aiChatText.trim().length > 0) {
      if (aiChatText.length > MAX_TEXT_LENGTH) {
        return NextResponse.json(
          { success: false, error: 'AI 대화 텍스트가 너무 깁니다 (최대 50만자).' },
          { status: 400 },
        );
      }

      const sanitized = sanitizeText(aiChatText);
      const userMsgs = extractUserMessages(sanitized);

      if (userMsgs.length >= 3) {
        const sample = userMsgs.slice(0, 100).join('\n---\n');
        aiChatContext = `
[AI 대화 기록 분석 데이터]
사용자 메시지 수: ${userMsgs.length}개

사용자 메시지 샘플 (최대 100개):
${sample}
`;
        dataSources.push('aiChat');
      }
    }

    // ------------------------------------------------------------------
    // 6. Face image → base64 (optional, consent required)
    // ------------------------------------------------------------------
    let faceBase64DataUrl: string | null = null;

    if (faceImage && faceImage instanceof File && faceConsent === 'true') {
      if (faceImage.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { success: false, error: '얼굴 이미지 크기가 너무 큽니다 (최대 5MB).' },
          { status: 400 },
        );
      }

      const ext = faceImage.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_IMAGE_TYPES.has(faceImage.type) && !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          { success: false, error: '허용되지 않는 이미지 형식입니다 (JPG, PNG, HEIC만 가능).' },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await faceImage.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = faceImage.type || 'image/jpeg';
      faceBase64DataUrl = `data:${mimeType};base64,${base64}`;
    }

    // ------------------------------------------------------------------
    // 7. Build saju context section
    // ------------------------------------------------------------------
    const sajuContext = `
[사주 분석 데이터]
사주: ${saju.fullString}
일간: ${sajuStructure.dayMaster.stem} (${sajuStructure.dayMaster.element})
일간 강약: ${sajuStructure.dayMaster.strength.label} (점수: ${sajuStructure.dayMaster.strength.score})
월지: ${sajuStructure.monthSupport.branch} (${sajuStructure.monthSupport.element})
계절: ${sajuStructure.monthSupport.season} (${sajuStructure.monthSupport.climate})
천간 오행: 년:${sajuStructure.stemElements.year.stem}/${sajuStructure.stemElements.year.element} / 월:${sajuStructure.stemElements.month.stem}/${sajuStructure.stemElements.month.element} / 일:${sajuStructure.stemElements.day.stem}/${sajuStructure.stemElements.day.element} / 시:${sajuStructure.stemElements.hour.stem}/${sajuStructure.stemElements.hour.element}
지지 오행: 년:${sajuStructure.branchElements.year.branch}/${sajuStructure.branchElements.year.element} / 월:${sajuStructure.branchElements.month.branch}/${sajuStructure.branchElements.month.element} / 일:${sajuStructure.branchElements.day.branch}/${sajuStructure.branchElements.day.element} / 시:${sajuStructure.branchElements.hour.branch}/${sajuStructure.branchElements.hour.element}

[육친 구조]
${yukchinString}
`;

    // ------------------------------------------------------------------
    // 8. Face analysis via GPT-4o vision (separate call)
    // ------------------------------------------------------------------
    let faceAnalysisText = '';

    if (faceBase64DataUrl) {
      try {
        const faceResponse = await client.chat.completions.create({
          model: VISION_MODEL,
          max_tokens: 600,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `너는 전통 관상학 관점에서 얼굴 인상을 해석하는 전문가다.

절대 금지 사항:
- 인종, 민족, 출신 지역 추정 금지
- 종교, 정치 성향 추정 금지
- 성적 지향 추정 금지
- 건강 상태, 질병 진단 금지
- 나이 추정 금지
- 부정적이거나 비하하는 표현 금지

분석 범위 (허용):
- 눈: 인상, 에너지
- 코: 안정감, 의지
- 입: 표현력, 소통
- 전체 인상: 에너지, 분위기
- 성향 경향: 정확히 3가지

톤: 따뜻하고 긍정적, 한국어
분량: 200~400자

자연스러운 문장으로 인상을 설명해라. JSON이 아닌 일반 텍스트로 작성해라.`,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: '이 얼굴 사진을 전통 관상학 관점에서 분석해주세요.' },
                { type: 'image_url', image_url: { url: faceBase64DataUrl, detail: 'low' } },
              ],
            },
          ],
        });

        faceAnalysisText = faceResponse.choices?.[0]?.message?.content?.trim() ?? '';
        if (faceAnalysisText) {
          dataSources.push('faceAnalysis');
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'unknown';
        console.error('[integrated] Face analysis failed (graceful skip):', msg);
        // Gracefully skip face analysis on error
      }
    }

    // ------------------------------------------------------------------
    // 9. Build face context section
    // ------------------------------------------------------------------
    const faceContext = faceAnalysisText
      ? `
[관상 분석 데이터]
${faceAnalysisText}
`
      : '';

    // ------------------------------------------------------------------
    // 10. Determine analysis mode
    // ------------------------------------------------------------------
    const hasChatData = dataSources.includes('kakaoTalk') || dataSources.includes('aiChat');
    const analysisMode = hasChatData ? 'relationship' : 'selfUnderstanding';

    // ------------------------------------------------------------------
    // 11. Build the synthesis GPT system prompt
    // ------------------------------------------------------------------
    const synthesisSystemPrompt = `너는 사주 명리학, 대인관계 심리학, 행동과학을 통합하는 프리미엄 분석 전문가다.
사용자가 제공한 데이터 소스를 종합하여 깊이 있고 실행 가능한 분석 리포트를 생성해라.

[제공된 데이터 소스]
${dataSources.join(', ')}

[분석 모드]
${analysisMode === 'relationship' ? '관계 분석 중심 — 대화 데이터와 사주를 결합하여 관계 역학, 감정 흐름, 개선점을 분석' : '자기 이해 중심 — 사주와 제공된 데이터를 기반으로 성격 패턴, 인생 타이밍, 자기 성찰을 분석'}

${sajuContext}
${kakaoContext}
${aiChatContext}
${faceContext}

[핵심 규칙]
1) 제공된 데이터만 사용해라. 없는 데이터를 추측하지 마라.
2) 모든 주장에 근거를 달아라 (사주 구조, 대화 패턴, 행동 빈도 등).
3) 점수(0-100)는 근거에 기반해 차별적으로 부여해라. 모든 점수를 비슷하게 주지 마라.
4) 행동 제안은 구체적이어야 한다 (기한, 빈도, 구체적 행동 단위 포함).
5) 톤: 따뜻하지만 솔직한 코칭. 과장하지 말고 공감하되 핵심을 짚어라.
6) ${analysisMode === 'selfUnderstanding' ? 'deepDive는 관계 역학 대신 성격 패턴, 인생 타이밍, 자기 이해에 초점을 맞춰라. 점수는 자기 내면 기준으로 부여해라 (balance=내면 균형, emotionalSafety=정서적 안정감, repairAbility=회복탄력성, investment=삶에 대한 몰입도, attachmentLoop=집착/불안 패턴, futureAlignment=미래 방향 정렬도).' : '관계 데이터에 기반한 역학 분석을 수행해라.'}
7) 사주 전문 용어는 최소화하고 일상 언어로 풀어서 설명해라.
8) 한국어로 작성해라.

[출력 형식]
반드시 아래 JSON 형식으로만 답변해라 (다른 텍스트 없이):
{
  "executiveSummary": {
    "diagnosis": "1-2줄 핵심 진단",
    "scores": {
      "balance": 0-100,
      "emotionalSafety": 0-100,
      "repairAbility": 0-100,
      "investment": 0-100,
      "attachmentLoop": 0-100,
      "futureAlignment": 0-100
    },
    "scoreExplanations": {
      "balance": "점수에 대한 짧은 설명",
      "emotionalSafety": "점수에 대한 짧은 설명",
      "repairAbility": "점수에 대한 짧은 설명",
      "investment": "점수에 대한 짧은 설명",
      "attachmentLoop": "점수에 대한 짧은 설명",
      "futureAlignment": "점수에 대한 짧은 설명"
    },
    "risks": ["위험요소1", "위험요소2", "위험요소3"],
    "opportunities": ["기회요소1", "기회요소2", "기회요소3"],
    "actions48h": ["48시간 내 행동1", "48시간 내 행동2", "48시간 내 행동3"]
  },
  "deepDive": [
    { "claim": "주장", "evidence": "근거", "interpretation": "해석", "action": "행동 제안" }
  ],
  "actionPlan": {
    "hours48": ["48시간 내 실천1", "48시간 내 실천2"],
    "week1": ["1주 내 실천1", "1주 내 실천2"],
    "week4": ["4주 내 실천1", "4주 내 실천2"],
    "scripts": {
      "apology": "사과 스크립트",
      "boundary": "경계 설정 스크립트",
      "request": "요청 스크립트",
      "repair": "관계 회복 스크립트",
      "closure": "마무리 스크립트"
    }
  },
  "concernResponse": {
    "question": "사용자의 질문 (없으면 빈 문자열)",
    "scenarios": {
      "optimistic": { "conditions": "낙관적 조건", "evidence": "근거", "actions": "행동" },
      "neutral": { "conditions": "중립적 조건", "evidence": "근거", "actions": "행동" },
      "pessimistic": { "conditions": "비관적 조건", "evidence": "근거", "actions": "행동" }
    }
  },
  "sajuSummary": "사주 요약 (일반인이 이해할 수 있는 1-3문장)",
  "dataSources": ${JSON.stringify(dataSources)},
  "disclaimer": "${DISCLAIMER}"
}

deepDive 항목은 4~6개로 작성해라. ${analysisMode === 'selfUnderstanding' ? 'scripts는 자기 대화(self-talk) 관점으로 작성해라 (apology=자기 용서, boundary=한계 설정, request=필요 표현, repair=내면 회복, closure=과거 정리).' : ''}
concernResponse의 question 필드에는 사용자의 실제 질문을 넣어라. 질문이 없으면 빈 문자열을 넣어라.`;

    const userMessage = `성별: ${gender}
사용자 질문: ${question || '(없음)'}

위 데이터를 종합하여 분석 리포트를 JSON으로 생성해주세요.`;

    // ------------------------------------------------------------------
    // 12. Main synthesis GPT call
    // ------------------------------------------------------------------
    const synthesisResponse = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 4000,
      temperature: 0.6,
      messages: [
        { role: 'system', content: synthesisSystemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const rawContent = synthesisResponse.choices?.[0]?.message?.content?.trim() ?? '';
    if (!rawContent) {
      throw new Error('AI 종합 분석 응답이 비어 있습니다.');
    }

    // ------------------------------------------------------------------
    // 13. Parse JSON response
    // ------------------------------------------------------------------
    const report = safeParseJSON<IntegratedReport>(rawContent);

    if (!report) {
      console.error('[integrated] Failed to parse GPT JSON. Raw:', rawContent.slice(0, 500));
      return NextResponse.json(
        {
          success: false,
          error: 'AI 응답을 파싱하지 못했습니다. 다시 시도해주세요.',
          rawFallback: rawContent,
        },
        { status: 500 },
      );
    }

    // Ensure dataSources and disclaimer are always present
    report.dataSources = dataSources;
    report.disclaimer = DISCLAIMER;

    // Ensure concernResponse has a question field
    if (!report.concernResponse) {
      report.concernResponse = {
        question: question || '',
        scenarios: {
          optimistic: { conditions: '', evidence: '', actions: '' },
          neutral: { conditions: '', evidence: '', actions: '' },
          pessimistic: { conditions: '', evidence: '', actions: '' },
        },
      };
    } else if (!report.concernResponse.question && report.concernResponse.question !== '') {
      report.concernResponse.question = question || '';
    }

    // ------------------------------------------------------------------
    // 14. Return structured report
    // ------------------------------------------------------------------
    const inputTokens = synthesisResponse.usage?.prompt_tokens ?? 0;
    const outputTokens = synthesisResponse.usage?.completion_tokens ?? 0;

    return NextResponse.json({
      success: true,
      result: report,
      sajuInfo: {
        fullString: saju.fullString,
        dayMaster: {
          stem: sajuStructure.dayMaster.stem,
          element: sajuStructure.dayMaster.element,
          strength: sajuStructure.dayMaster.strength,
        },
        monthSupport: sajuStructure.monthSupport,
      },
      usage: {
        inputTokens,
        outputTokens,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '종합 분석 중 오류가 발생했습니다.';
    console.error('[integrated] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
