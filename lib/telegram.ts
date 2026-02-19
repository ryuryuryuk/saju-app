const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramSendMessageOptions {
  parseMode?: 'Markdown' | 'HTML';
  replyMarkup?: {
    inline_keyboard: TelegramInlineButton[][];
  };
}

export class TelegramBotBlockedError extends Error {
  constructor(chatId: number) {
    super(`Bot blocked by user ${chatId}`);
    this.name = 'TelegramBotBlockedError';
  }
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: TelegramSendMessageOptions,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode ?? 'Markdown',
      reply_markup: options?.replyMarkup,
    }),
  });

  if (res.status === 403) {
    throw new TelegramBotBlockedError(chatId);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

export async function sendChatAction(
  chatId: number,
  action: string = 'typing',
): Promise<void> {
  await fetch(`${BASE_URL}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action,
    }),
  });
}

export interface AnswerCallbackOptions {
  text?: string;
  showAlert?: boolean;
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  options?: AnswerCallbackOptions,
): Promise<void> {
  await fetch(`${BASE_URL}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: options?.text,
      show_alert: options?.showAlert ?? false,
    }),
  });
}
