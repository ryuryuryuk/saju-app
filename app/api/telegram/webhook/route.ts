import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { TelegramUpdate, TelegramCallbackQuery } from '@/lib/telegram';
import { sendMessage, sendChatAction, answerCallbackQuery } from '@/lib/telegram';
import { addTurn } from '@/lib/kakao-history';
import { generateReply, extractAndValidateProfile } from '@/lib/kakao-service';
import {
  getProfile,
  upsertProfile,
  deleteProfile,
  getDbHistory,
  addDbTurn,
} from '@/lib/user-profile';
import type { UserProfile } from '@/lib/user-profile';
import { trackInterest } from '@/lib/interest-helpers';
import { getLatestLogId, markOpened, markPremiumConverted } from '@/lib/push-logger';

const INTERIM_TIMEOUT_MS = 3000;

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

// Vercel 함수 최대 실행 시간 설정 (초)
export const maxDuration = 60;

function extractName(from: {
  first_name: string;
  last_name?: string;
  username?: string;
}): string {
  if (from.last_name) return `${from.first_name} ${from.last_name}`;
  return from.first_name;
}

async function tryParseAndSaveProfile(
  userId: string,
  utterance: string,
  displayName: string,
): Promise<UserProfile | null> {
  const validated = extractAndValidateProfile(utterance);
  if (!validated) return null;

  return await upsertProfile({
    platform: 'telegram',
    platform_user_id: userId,
    display_name: displayName,
    birth_year: Number(validated.year),
    birth_month: Number(validated.month),
    birth_day: Number(validated.day),
    birth_hour: Number(validated.hour),
    birth_minute: Number(validated.minute),
    gender: validated.gender,
  });
}

const INTERIM_STYLES = [
  '사용자의 질문 속 감정을 정확히 짚어주는 한마디를 해라. 마치 오래 알던 친구가 "야 너 그거 때문에 그렇지?" 하는 느낌.',
  '사용자가 미처 말하지 않은 숨은 걱정을 꿰뚫어 보는 질문을 던져라. "혹시 진짜 고민은 다른 데 있는 거 아니야?" 같은.',
  '사용자의 상황에 대해 "나도 그랬는데" 식으로 공감한 뒤, 사주에서 의외의 단서가 보인다고 살짝 언급해라.',
  '사용자의 질문을 더 깊이 파고드는 되물음을 해라. "근데 그게 진짜 원하는 거야, 아니면 불안해서 그런 거야?" 같은.',
  '사용자의 고민 핵심을 한 문장으로 요약해주고, "근데 이거 사주로 보면 생각보다 단순한 문제가 아니거든" 식으로 호기심을 유발해라.',
] as const;

async function generateInterimMessage(
  utterance: string,
  history: { role: string; content: string }[],
): Promise<string> {
  const style = INTERIM_STYLES[Math.floor(Math.random() * INTERIM_STYLES.length)];

  // 직전 어시스턴트 메시지들 추출 (중복 방지용)
  const recentAssistantMsgs = history
    .filter((h) => h.role === 'assistant')
    .slice(-3)
    .map((h) => h.content.slice(0, 100))
    .join('\n');

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.95,
      max_completion_tokens: 120,
      messages: [
        {
          role: 'system',
          content: `너는 사주 상담 AI다. 사용자의 질문에 대해 깊은 분석이 진행 중이고, 그 사이에 보낼 짧은 중간 메시지를 생성해라.

[이번 메시지 스타일]
${style}

[핵심 규칙]
- 매번 다른 접근을 해라. 아래 "이전 메시지"와 구조, 문장 패턴, 키워드가 겹치면 안 된다.
- "혹시 ~거 아니야? 근데 사주 보니까 재밌는 흐름이~" 같은 뻔한 공식 절대 반복 금지.
- 사용자가 이전 대화 맥락 위에서 이어 질문한 경우, 그 흐름을 이해하고 자연스럽게 이어가라.
- 구체적 분석 결과는 절대 말하지 마. 분석은 아직 안 끝났으니까.

[톤]
- 진짜 사람처럼 자연스럽게. 공식 느낌 나면 실패다.
- 같은 사람이 쓴 것처럼 보이면 안 된다. 매번 살짝 다른 성격이 묻어나게.

[금지]
- "분석중", "잠시만", "기다려", "준비중" 같은 대기 표현.
- "재밌는 흐름", "의외의 포인트", "흥미로운" — 이미 너무 많이 쓴 표현이니 다른 말로 바꿔라.
- 이모지, 마크다운, 번호, 불릿.
- 80자 이내.

[이전에 보낸 메시지 — 절대 비슷하게 쓰지 마]
${recentAssistantMsgs || '없음'}`,
        },
        {
          role: 'user',
          content: utterance,
        },
      ],
    });
    const content = response.choices?.[0]?.message?.content?.trim();
    if (content) return content;
  } catch (err: unknown) {
    console.error('[telegram] interim message generation failed:', err);
  }
  return getKeywordFallback(utterance);
}

function getKeywordFallback(utterance: string): string {
  // 랜덤 인덱스로 같은 카테고리에서도 다른 메시지 선택
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (/(연애|사랑|이별|짝|소개팅|결혼|궁합)/.test(utterance)) {
    return pick([
      '그 사람 때문에 요즘 잠이 잘 안 오지?',
      '이 질문 하기까지 꽤 고민했을 것 같아.',
      '마음이 끌리는데 확신이 안 서는 거지, 맞아?',
    ]);
  }
  if (/(직장|이직|취업|사업|회사|승진|퇴사)/.test(utterance)) {
    return pick([
      '지금 자리에서 버텨야 하나 나가야 하나, 그게 제일 답답하지.',
      '사실 답은 어느 정도 정해놓고 확인받고 싶은 거 아니야?',
      '요즘 일하면서 체력도 마음도 같이 빠지는 느낌이지?',
    ]);
  }
  if (/(돈|재물|투자|주식|부동산|금전)/.test(utterance)) {
    return pick([
      '돈 문제는 생각할수록 불안해지잖아, 이해해.',
      '지금 뭔가 결정해야 하는 타이밍인 것 같은데.',
      '쓸 데는 많고 들어오는 건 불안하고, 그런 시기지?',
    ]);
  }
  if (/(건강|몸|아프|병원|체력)/.test(utterance)) {
    return pick([
      '몸이 보내는 신호가 있을 때 잡아야 해.',
      '요즘 좀 무리한 거 아니야? 네 체질상 신경 쓸 부분이 있어.',
      '건강 걱정이 다른 고민까지 키우잖아, 같이 봐줄게.',
    ]);
  }
  return pick([
    '이 질문 속에 꽤 오래 품어온 고민이 느껴져.',
    '겉으로는 담담한데 속으로는 많이 답답했을 것 같아.',
    '뭔가 결정의 갈림길에 서 있는 느낌이 드는데.',
  ]);
}

async function handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  const callbackId = query.id;
  const data = query.data;
  const chatId = query.message?.chat.id;
  const userId = String(query.from.id);

  if (!chatId) {
    await answerCallbackQuery(callbackId);
    return;
  }

  try {
    switch (data) {
      case 'premium_daily': {
        // 유료 결제 플로우 - 전체 풀이 안내 + 로그 기록
        await answerCallbackQuery(callbackId);
        getLatestLogId(userId).then((logId) => {
          if (logId) {
            markOpened(logId).catch(() => {});
            markPremiumConverted(logId).catch(() => {});
          }
        }).catch(() => {});
        await sendMessage(
          chatId,
          '🔓 *전체 풀이 서비스*\n\n' +
            '블랭크 처리된 부분을 포함한 상세 분석을 받아보세요.\n\n' +
            '• 오늘의 핵심 시간대\n' +
            '• 행운의 방위와 색상\n' +
            '• 주의해야 할 상황\n' +
            '• 구체적인 행동 가이드\n\n' +
            '💎 프리미엄 서비스 준비 중입니다.\n' +
            '출시되면 알려드릴게요!',
          { parseMode: 'Markdown' },
        );
        break;
      }

      case 'chat_start': {
        // 일반 채팅 연결 + 로그 기록
        await answerCallbackQuery(callbackId, { text: '질문을 입력해주세요!' });
        getLatestLogId(userId).then((logId) => {
          if (logId) markOpened(logId).catch(() => {});
        }).catch(() => {});
        const profile = await getProfile('telegram', userId);
        if (profile) {
          await sendMessage(
            chatId,
            '💬 궁금한 점을 자유롭게 물어보세요!\n\n' +
              '예시:\n' +
              '• "오늘 중요한 미팅이 있는데 어떨까?"\n' +
              '• "이번 달 재물운은 어때?"\n' +
              '• "그 사람이랑 연락해도 될까?"',
          );
        } else {
          await sendMessage(
            chatId,
            '먼저 프로필을 등록해주세요!\n\n' +
              '생년월일시와 성별을 보내주시면 맞춤 분석을 시작할 수 있어요.\n' +
              '예: 1994년 10월 3일 오후 7시 30분 여성',
          );
        }
        break;
      }

      default:
        await answerCallbackQuery(callbackId);
    }
  } catch (err: unknown) {
    console.error('[telegram] handleCallbackQuery error:', err);
    await answerCallbackQuery(callbackId, { text: '오류가 발생했습니다.' });
  }
}

async function handleMessage(
  chatId: number,
  userId: string,
  utterance: string,
  displayName: string,
) {
  try {
    // 1. 저장된 프로필 확인
    const profile = await getProfile('telegram', userId);

    // 2. 타이핑 표시
    await sendChatAction(chatId);

    // 3. /profile 명령어: 저장된 프로필 조회
    if (utterance === '/profile') {
      if (!profile) {
        await sendMessage(
          chatId,
          '아직 등록된 프로필이 없어요.\n\n' +
            '생년월일시와 성별을 보내주시면 저장해드릴게요!\n' +
            '예: 1994년 10월 3일 오후 7시 30분 여성',
        );
      } else {
        await sendMessage(
          chatId,
          `등록된 프로필 정보:\n\n` +
            `이름: ${profile.display_name ?? '미등록'}\n` +
            `생년월일: ${profile.birth_year}년 ${profile.birth_month}월 ${profile.birth_day}일\n` +
            `시간: ${profile.birth_hour}시 ${profile.birth_minute}분\n` +
            `성별: ${profile.gender}\n\n` +
            `수정하려면 /reset 후 다시 입력해주세요.`,
        );
      }
      return;
    }

    // 4. /reset 명령어: 프로필 초기화
    if (utterance === '/reset') {
      await deleteProfile('telegram', userId);
      await sendMessage(
        chatId,
        '프로필이 초기화되었어요. 생년월일시와 성별을 다시 보내주세요!\n' +
          '예: 1994년 10월 3일 오후 7시 30분 여성',
      );
      return;
    }

    // 5. 프로필이 없으면 — 생년월일 파싱 → 저장 시도
    if (!profile) {
      const saved = await tryParseAndSaveProfile(userId, utterance, displayName);
      if (saved) {
        await sendMessage(
          chatId,
          `프로필을 저장했어요!\n\n` +
            `생년월일: ${saved.birth_year}년 ${saved.birth_month}월 ${saved.birth_day}일\n` +
            `시간: ${saved.birth_hour}시 ${saved.birth_minute}분\n` +
            `성별: ${saved.gender}\n\n` +
            `이제 궁금한 점을 자유롭게 물어보세요!\n` +
            `"올해 연애운 어때?"\n` +
            `"직장에서 이직할 타이밍인가?"\n` +
            `"올해 전체 운세 알려줘"`,
        );
        return;
      }
      // 파싱 실패 — 안내 메시지
      await sendMessage(
        chatId,
        '맞춤 사주 분석을 위해 생년월일시와 성별을 알려주세요!\n\n' +
          '형식: YYYY년 M월 D일 (오전/오후) H시 M분 성별\n' +
          '예: 1994년 10월 3일 오후 7시 30분 여성\n\n' +
          '태어난 시간을 모르면 "모름"이라고 적어주세요.',
      );
      return;
    }

    // 6. DB 히스토리 로드 + 사용자 발화 저장
    const dbHistory = await getDbHistory('telegram', userId);
    const history = dbHistory.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
      timestamp: Date.now(),
    }));
    await addDbTurn('telegram', userId, 'user', utterance);
    addTurn(userId, 'user', utterance);

    // 관심사 추적 (fire-and-forget — 응답 속도에 영향 없도록)
    trackInterest('telegram', userId, utterance).catch((err) =>
      console.error('[telegram] trackInterest error:', err),
    );

    // 7. 분석 즉시 시작 + 중간 메시지 병렬 준비
    const storedBirthProfile = {
      year: String(profile.birth_year),
      month: String(profile.birth_month),
      day: String(profile.birth_day),
      hour: String(profile.birth_hour),
      minute: String(profile.birth_minute),
      gender: profile.gender as '남성' | '여성',
    };

    const analysisPromise = generateReply(utterance, history, storedBirthProfile);
    const interimPromise = generateInterimMessage(utterance, dbHistory);

    // 8. 3초 레이스: 분석이 3초 안에 끝나면 중간 메시지 생략
    const TIMEOUT = Symbol('timeout');
    const raceResult = await Promise.race([
      analysisPromise.then((r) => ({ type: 'done' as const, reply: r })),
      new Promise<{ type: typeof TIMEOUT }>((resolve) =>
        setTimeout(() => resolve({ type: TIMEOUT }), INTERIM_TIMEOUT_MS),
      ),
    ]);

    let reply: string;

    if (raceResult.type === 'done') {
      // 3초 이내 완료 — 바로 발송
      reply = raceResult.reply;
    } else {
      // 3초 초과 — 중간 메시지 발송 후 분석 대기
      const interimMsg = await interimPromise;
      await sendMessage(chatId, interimMsg);
      await sendChatAction(chatId);
      reply = await analysisPromise;
    }

    // 9. 답변 저장 + 발송
    await addDbTurn('telegram', userId, 'assistant', reply);
    addTurn(userId, 'assistant', reply);
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

    // 인라인 버튼 클릭 (callback_query) 처리
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = update.message;

    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const utterance = message.text.trim();
    const displayName = extractName(message.from);

    // /start 명령어 처리
    if (utterance === '/start') {
      const profile = await getProfile('telegram', userId);
      if (profile) {
        await sendMessage(
          chatId,
          `다시 오셨군요, ${profile.display_name ?? ''}님! 반가워요.\n\n` +
            `저장된 프로필로 바로 분석해드릴게요.\n` +
            `궁금한 점을 자유롭게 물어보세요!\n\n` +
            `명령어:\n/profile - 내 프로필 보기\n/reset - 프로필 초기화`,
        );
      } else {
        await sendMessage(
          chatId,
          '안녕하세요! AI 사주 분석 서비스입니다.\n\n' +
            '생년월일시와 성별을 알려주세요.\n' +
            '예: 1994년 10월 3일 오후 7시 30분 여성\n\n' +
            '한 번 등록하면 다음부터는 바로 질문할 수 있어요!',
        );
      }
      return NextResponse.json({ ok: true });
    }

    // 메시지 처리
    await handleMessage(chatId, userId, utterance, displayName);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[telegram/webhook] error:', err);
    return NextResponse.json({ ok: true });
  }
}
