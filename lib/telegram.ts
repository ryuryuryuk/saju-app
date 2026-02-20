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

export interface TelegramSendResult {
  ok: boolean;
  statusCode: number;
  description?: string;
  messageId?: number;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: TelegramSendMessageOptions,
): Promise<TelegramSendResult> {
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

  const body = await res.json().catch(() => ({ ok: false, description: 'Failed to parse response' }));

  if (!res.ok) {
    throw new Error(`Telegram API error ${res.status}: ${body.description ?? JSON.stringify(body)}`);
  }

  return {
    ok: body.ok ?? true,
    statusCode: res.status,
    description: body.description,
    messageId: body.result?.message_id,
  };
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

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  parseMode?: 'Markdown' | 'HTML',
): Promise<void> {
  await fetch(`${BASE_URL}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    }),
  }).catch(() => {});
}

export async function deleteMessage(
  chatId: number,
  messageId: number,
): Promise<void> {
  await fetch(`${BASE_URL}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
  }).catch(() => {});
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
