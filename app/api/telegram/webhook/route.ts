import { NextRequest, NextResponse } from 'next/server';
import type { TelegramUpdate } from '@/lib/telegram';
import { sendMessage, sendChatAction } from '@/lib/telegram';
import { getHistory, addTurn } from '@/lib/kakao-history';
import { generateReply } from '@/lib/kakao-service';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

// Vercel 함수 최대 실행 시간 설정 (초)
export const maxDuration = 60;

async function handleMessage(chatId: number, userId: string, utterance: string) {
  try {
    // 타이핑 표시 + 안내 메시지
    await sendChatAction(chatId);
    await sendMessage(chatId, '분석중입니다. 잠시만 기다려주세요...');

    // 대화 히스토리 로드 + 사용자 발화 저장
    const history = getHistory(userId);
    addTurn(userId, 'user', utterance);

    // 사주 분석
    const reply = await generateReply(utterance, history);

    // 어시스턴트 답변 저장
    addTurn(userId, 'assistant', reply);

    // 결과 발송
    await sendMessage(chatId, reply);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('[telegram] handleMessage error:', err);
    await sendMessage(chatId, `오류가 발생했습니다: ${msg}`);
  }
}

export async function POST(req: NextRequest) {
  // Webhook secret 검증 (선택)
  if (WEBHOOK_SECRET) {
    const token = req.headers.get('x-telegram-bot-api-secret-token');
    if (token !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const update: TelegramUpdate = await req.json();
    const message = update.message;

    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const utterance = message.text.trim();

    // /start 명령어 처리
    if (utterance === '/start') {
      await sendMessage(
        chatId,
        '안녕하세요! AI 사주 분석 서비스입니다.\n\n' +
          '생년월일시와 성별을 알려주세요.\n' +
          '예: 1994년 10월 3일 오후 7시 30분 여성',
      );
      return NextResponse.json({ ok: true });
    }

    // 메시지 처리 (await — Vercel 함수 내에서 완료될 때까지 대기)
    await handleMessage(chatId, userId, utterance);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[telegram/webhook] error:', err);
    return NextResponse.json({ ok: true });
  }
}
