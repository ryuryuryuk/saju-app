import { sendMessage, TelegramBotBlockedError, type TelegramInlineButton } from '@/lib/telegram';
import { getActiveProfiles, deactivateUser } from '@/lib/user-profile';
import { generateDailyMessage, type DailyMessageResult } from '@/lib/daily_message_generator';
import { getRandomFallback } from '@/lib/fallback-templates';
import { logPush } from '@/lib/push-logger';
const PER_USER_DELAY_MS = 50; // 텔레그램 rate limit: 사용자 간 0.05초
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

export interface SendResult {
  userId: string;
  success: boolean;
  category?: string;
  error?: string;
  retries?: number;
}

export interface DailySendReport {
  total: number;
  success: number;
  failed: number;
  results: SendResult[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSeoulDate(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

async function trySendMessage(
  chatId: number,
  message: DailyMessageResult,
): Promise<void> {
  const keyboard: TelegramInlineButton[][] = [
    message.buttons.map((btn) => ({
      text: btn.text,
      callback_data: btn.callback_data,
    })),
  ];

  await sendMessage(chatId, message.text, {
    parseMode: 'Markdown',
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function sendWithRetry(
  chatId: number,
  message: DailyMessageResult,
): Promise<{ retries: number }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await trySendMessage(chatId, message);
      return { retries: attempt };
    } catch (err: unknown) {
      // 403은 재시도 불필요 — 즉시 throw
      if (err instanceof TelegramBotBlockedError) throw err;

      lastError = err;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

/**
 * 모든 활성 텔레그램 사용자에게 매일 운세 메시지를 발송한다.
 * - 최근 7일 내 대화한 사용자만 대상
 * - 사용자 간 50ms 간격 (rate limit)
 * - 실패 시 최대 2회 재시도
 * - 403(봇 차단) → is_active = false
 * - LLM 실패 → 폴백 템플릿
 * - 모든 결과 daily_push_log에 기록
 */
export async function sendDailyMessagesToAll(): Promise<DailySendReport> {
  const profiles = await getActiveProfiles('telegram', 7);

  const results: SendResult[] = [];
  let success = 0;
  let failed = 0;

  const dateText = formatSeoulDate();

  for (const profile of profiles) {
    const userId = profile.platform_user_id;
    const chatId = Number(userId);
    const displayName = profile.display_name || '회원';

    let message: DailyMessageResult;
    let usedFallback = false;

    // 1. 메시지 생성 (LLM 실패 → 폴백)
    try {
      message = await generateDailyMessage(chatId);
    } catch (genErr: unknown) {
      console.warn(`[daily-sender] LLM failed for ${userId}, using fallback:`, genErr instanceof Error ? genErr.message : genErr);
      const fallbackText = getRandomFallback('general', { user_name: displayName, date: dateText });
      message = {
        text: fallbackText,
        category: 'general',
        persona: null,
        buttons: [
          { text: '🔓 전체 풀이 보기', callback_data: 'premium_daily' },
          { text: '💬 더 물어보기', callback_data: 'chat_start' },
        ],
      };
      usedFallback = true;
    }

    // 2. 발송 (재시도 + 403 처리)
    try {
      const { retries } = await sendWithRetry(chatId, message);

      const status = retries > 0 ? 'retried' as const : 'success' as const;
      results.push({ userId, success: true, category: message.category, retries });
      success++;

      logPush({
        user_id: userId,
        category: message.category,
        message_text: message.text,
        status,
      }).catch(() => {}); // fire-and-forget
    } catch (sendErr: unknown) {
      // 403 → 비활성화
      if (sendErr instanceof TelegramBotBlockedError) {
        console.warn(`[daily-sender] Bot blocked by ${userId}, deactivating`);
        deactivateUser('telegram', userId).catch(() => {});
      }

      const errorMsg = sendErr instanceof Error ? sendErr.message : 'Unknown error';
      console.error(`[daily-sender] Failed to send to ${userId}:`, errorMsg);
      results.push({ userId, success: false, error: errorMsg });
      failed++;

      logPush({
        user_id: userId,
        category: usedFallback ? 'general' : message.category,
        message_text: message.text,
        status: 'failed',
      }).catch(() => {});
    }

    // 3. Rate limit 대기
    await delay(PER_USER_DELAY_MS);
  }

  return { total: profiles.length, success, failed, results };
}

/**
 * 단일 사용자에게 매일 운세 메시지를 발송한다.
 * 테스트 또는 개별 재발송용.
 */
export async function sendDailyMessageToOne(userId: number): Promise<SendResult> {
  try {
    const message = await generateDailyMessage(userId);
    await trySendMessage(userId, message);

    logPush({
      user_id: String(userId),
      category: message.category,
      message_text: message.text,
      status: 'success',
    }).catch(() => {});

    return { userId: String(userId), success: true, category: message.category };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[daily-sender] Failed to send to ${userId}:`, errorMsg);

    logPush({
      user_id: String(userId),
      category: 'general',
      message_text: '',
      status: 'failed',
    }).catch(() => {});

    return { userId: String(userId), success: false, error: errorMsg };
  }
}
