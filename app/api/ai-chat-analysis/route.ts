import OpenAI from 'openai';
import { sanitizeText } from '@/lib/upload-validation';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const MAX_TEXT_LENGTH = 200_000;

function extractUserMessages(raw: string): string[] {
  const lines = raw.split('\n');
  const userMessages: string[] = [];

  // Try JSON format first (ChatGPT export)
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.role === 'user' || item.author?.role === 'user') {
          const content = typeof item.content === 'string'
            ? item.content
            : item.content?.parts?.join('\n') ?? '';
          if (content.trim()) userMessages.push(content.trim());
        }
      }
      if (userMessages.length > 0) return userMessages;
    }
  } catch {
    // Not JSON, try text patterns
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

  // Fallback: if no pattern matched, treat all non-empty lines as user messages
  if (userMessages.length === 0) {
    return lines.filter((l) => l.trim().length > 0).map((l) => l.trim());
  }

  return userMessages;
}

function filterByPeriod(messages: string[], period: string): string[] {
  if (period === 'all' || messages.length <= 10) return messages;
  if (period === '1month') return messages.slice(-Math.ceil(messages.length * 0.25));
  if (period === '3months') return messages.slice(-Math.ceil(messages.length * 0.75));
  return messages;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, period } = body as { text?: string; period?: string };

    if (!text || typeof text !== 'string') {
      return Response.json({ success: false, error: '대화 내용을 입력해주세요.' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json({ success: false, error: '텍스트가 너무 깁니다 (최대 20만자).' }, { status: 400 });
    }

    const validPeriods = ['all', '1month', '3months'];
    const selectedPeriod = validPeriods.includes(period ?? '') ? period! : 'all';

    const sanitized = sanitizeText(text);
    const allUserMessages = extractUserMessages(sanitized);
    const filtered = filterByPeriod(allUserMessages, selectedPeriod);

    if (filtered.length < 3) {
      return Response.json({ success: false, error: '분석할 메시지가 너무 적습니다. 최소 3개 이상의 사용자 메시지가 필요합니다.' }, { status: 400 });
    }

    const sample = filtered.slice(0, 150).join('\n---\n');

    const systemPrompt = `너는 심리분석 전문가다.
사용자가 AI와 나눈 대화 기록을 분석해서 관심사, 사고 패턴, 반복되는 고민, 성향을 파악해라.
진단이 아닌 자기성찰 관점으로 작성. 한국어. 톤: 공감적이고 통찰력 있는.

반드시 아래 JSON 형식으로만 답변해라 (다른 텍스트 없이):
{
  "summary": "전체 요약 (3~5문장, 이 사람이 AI와 어떻게 대화하는지)",
  "topics": [
    { "category": "주제명", "percentage": 35 },
    { "category": "주제명", "percentage": 25 }
  ],
  "patterns": ["사고/행동 패턴 3~5개"],
  "insights": "종합 인사이트 (5~8문장, 이 사람의 내면과 성향에 대한 깊은 분석)",
  "recommendations": ["자기성찰/성장을 위한 구체적 제안 2~3개"]
}

topics의 percentage 합은 100이어야 한다. 3~6개 카테고리로 분류해라.`;

    const userMessage = `분석 대상: 사용자의 AI 대화 기록
총 메시지 수: ${filtered.length}개 (기간: ${selectedPeriod === 'all' ? '전체' : selectedPeriod === '1month' ? '최근 1개월' : '최근 3개월'})

사용자 메시지 샘플:
${sample}`;

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
          topics: [{ category: '일반', percentage: 100 }],
          patterns: ['AI 분석 결과를 요약 형태로 확인해주세요.'],
          insights: raw,
          recommendations: ['더 많은 대화 기록을 제공하면 분석 정확도가 올라갑니다.'],
        },
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI 대화 분석 중 오류가 발생했습니다.';
    console.error('[ai-chat-analysis] Error:', message);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
