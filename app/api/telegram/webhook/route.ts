import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { TelegramUpdate } from '@/lib/telegram';
import { sendMessage, sendChatAction } from '@/lib/telegram';
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

async function generateInterimMessage(utterance: string): Promise<string> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.95,
      max_completion_tokens: 120,
      messages: [
        {
          role: 'system',
          content: `너는 사주 상담 AI다. 사용자의 질문을 받았고, 깊은 분석이 진행 중이다.
사용자에게 보낼 "중간 메시지"를 생성해라. 이 메시지의 목표는:
1) 사용자가 "이 AI가 내 마음을 읽었다"고 느끼게 만들기
2) 다음에 올 분석 결과가 궁금해서 못 참게 만들기

작성법:
- 먼저 사용자 질문 뒤에 숨은 진짜 감정이나 상황을 짚어라. ("혹시 요즘 ~한 거 아니야?", "이 질문 뒤에 ~ 마음이 있는 것 같아.")
- 그 다음 사주에서 뭔가 흥미로운 게 보인다는 뉘앙스로 떡밥을 던져라. ("근데 네 사주 보니까 재밌는 흐름이 하나 있거든.", "올해 흐름에서 의외의 포인트가 하나 보여.")
- 구체적 분석 내용은 절대 말하지 마. 힌트만 줘서 기대감을 만들어라.

톤:
- 20대 친한 친구가 카페에서 눈 반짝이면서 "야 근데 이거 좀 신기한데?" 하는 느낌.
- "~거든", "~지?", "~인데" 같은 구어체 자연스럽게 써라.

금지:
- "분석중", "잠시만", "기다려", "준비중" 같은 대기 표현 절대 금지.
- 이모지, 마크다운, 번호, 불릿 금지.
- 2~3문장, 80자 이내.`,
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
  if (/(연애|사랑|이별|짝|소개팅|결혼|궁합)/.test(utterance)) {
    return '혹시 최근에 마음이 흔들리는 사람이 있는 거 아니야? 근데 네 사주에서 재밌는 흐름이 하나 보이거든.';
  }
  if (/(직장|이직|취업|사업|회사|승진|퇴사)/.test(utterance)) {
    return '요즘 현실적으로 고민이 많았을 것 같아. 근데 올해 흐름에서 의외의 포인트가 하나 있어.';
  }
  if (/(돈|재물|투자|주식|부동산|금전)/.test(utterance)) {
    return '돈 얘기가 나온 거 보면 요즘 좀 불안했지? 근데 네 사주에서 재물 쪽에 눈에 띄는 게 있거든.';
  }
  if (/(건강|몸|아프|병원|체력)/.test(utterance)) {
    return '몸이 좀 안 좋았구나. 근데 네 에너지 흐름 보니까 특별히 신경 써야 할 시기가 보여.';
  }
  return '이 질문 뒤에 꽤 깊은 고민이 있는 것 같아. 근데 사주에서 흥미로운 흐름이 하나 읽히거든.';
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
    const interimPromise = generateInterimMessage(utterance);

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
