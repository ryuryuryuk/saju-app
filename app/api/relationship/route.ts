import OpenAI from 'openai';
import { sanitizeText } from '@/lib/upload-validation';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const MAX_TEXT_LENGTH = 200_000;

interface ParsedMessage {
  sender: string;
  text: string;
  timestamp?: string;
}

function parseKakaoTalk(raw: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const lines = raw.split('\n');

  // Pattern 1: [이름] [오전/오후 HH:MM] 메시지
  const mobilePattern = /^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}:\d{2})\]\s*(.+)$/;
  // Pattern 2: 이름 : 메시지 (PC export)
  const pcPattern = /^(.+?)\s*:\s*(.+)$/;
  // Pattern 3: 2026. 2. 14. 오전 1:00, 이름 : 메시지
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

function anonymizeMessages(messages: ParsedMessage[]): ParsedMessage[] {
  const senders = [...new Set(messages.map((m) => m.sender))];
  const map: Record<string, string> = {};
  senders.forEach((s, i) => {
    map[s] = i === 0 ? '나' : i === 1 ? '상대방' : `참여자${i + 1}`;
  });
  return messages.map((m) => ({ ...m, sender: map[m.sender] ?? m.sender }));
}

function computeStats(messages: ParsedMessage[]) {
  const senders = [...new Set(messages.map((m) => m.sender))];
  const s1 = senders[0] ?? '나';
  const s2 = senders[1] ?? '상대방';

  const s1Msgs = messages.filter((m) => m.sender === s1);
  const s2Msgs = messages.filter((m) => m.sender === s2);
  const total = messages.length || 1;

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
    s1AvgLength: s1Msgs.length ? Math.round(s1Msgs.reduce((a, m) => a + m.text.length, 0) / s1Msgs.length) : 0,
    s2AvgLength: s2Msgs.length ? Math.round(s2Msgs.reduce((a, m) => a + m.text.length, 0) / s2Msgs.length) : 0,
    initiationRate: { you: +(s1First / firstTotal).toFixed(2), partner: +(s2First / firstTotal).toFixed(2) },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, analysisType, anonymize } = body as {
      text?: string;
      analysisType?: string;
      anonymize?: boolean;
    };

    if (!text || typeof text !== 'string') {
      return Response.json({ success: false, error: '대화 내용을 입력해주세요.' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json({ success: false, error: '텍스트가 너무 깁니다 (최대 20만자).' }, { status: 400 });
    }

    const validTypes = ['romantic', 'friend', 'family', 'colleague'];
    const type = validTypes.includes(analysisType ?? '') ? analysisType : 'romantic';

    const sanitized = sanitizeText(text);
    let messages = parseKakaoTalk(sanitized);

    if (messages.length < 5) {
      return Response.json({ success: false, error: '대화 메시지가 너무 적습니다. 최소 5개 이상의 메시지가 필요합니다.' }, { status: 400 });
    }

    if (anonymize !== false) {
      messages = anonymizeMessages(messages);
    }

    const stats = computeStats(messages);

    const conversationSample = messages
      .slice(0, 200)
      .map((m) => `${m.sender}: ${m.text}`)
      .join('\n');

    const systemPrompt = `너는 대인관계 심리분석 전문가다.
카카오톡 대화 패턴을 분석해서 관계 역학, 감정 흐름, 개선 포인트를 제시해라.
민감한 개인정보(실명, 전화번호, 주소 등)는 절대 언급하지 마라.
한국어로 답변. 톤: 따뜻하지만 솔직한 코칭.

반드시 아래 JSON 형식으로만 답변해라 (다른 텍스트 없이):
{
  "summary": "전체 관계 요약 (3~5문장)",
  "metrics": {
    "totalMessages": ${stats.totalMessages},
    "period": "분석 불가 (텍스트 기반)",
    "initiationRate": { "you": ${stats.initiationRate.you}, "partner": ${stats.initiationRate.partner} },
    "responseTime": { "you": "텍스트 기반 추정", "partner": "텍스트 기반 추정" },
    "emotionalTone": { "positive": 0.0, "neutral": 0.0, "negative": 0.0 }
  },
  "insights": ["인사이트 3~5개"],
  "recommendations": ["구체적 행동 제안 2~3개"]
}

emotionalTone의 세 값 합은 1.0이어야 한다. 대화 내용을 읽고 실제 감정 비율을 추정해라.
관계 유형: ${type}`;

    const userMessage = `대화 통계:
- 총 메시지: ${stats.totalMessages}개
- ${stats.s1Name}: ${stats.s1Count}개 (평균 ${stats.s1AvgLength}자)
- ${stats.s2Name}: ${stats.s2Count}개 (평균 ${stats.s2AvgLength}자)
- 대화 시작 비율: ${stats.s1Name} ${Math.round(stats.initiationRate.you * 100)}% / ${stats.s2Name} ${Math.round(stats.initiationRate.partner * 100)}%

대화 샘플 (처음 200개):
${conversationSample}`;

    const response = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 1500,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const raw = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      throw new Error('AI 응답이 비어 있습니다.');
    }

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      return Response.json({ success: true, result: parsed });
    } catch {
      return Response.json({
        success: true,
        result: {
          summary: raw,
          metrics: {
            totalMessages: stats.totalMessages,
            period: '분석 완료',
            initiationRate: stats.initiationRate,
            responseTime: { you: '-', partner: '-' },
            emotionalTone: { positive: 0.5, neutral: 0.3, negative: 0.2 },
          },
          insights: ['AI 분석 결과를 요약 형태로 확인해주세요.'],
          recommendations: ['대화 내용을 더 제공하면 정확도가 올라갑니다.'],
        },
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '관계 분석 중 오류가 발생했습니다.';
    console.error('[relationship] Error:', message);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
