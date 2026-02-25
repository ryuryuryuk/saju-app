import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { TelegramUpdate, TelegramCallbackQuery } from '@/lib/telegram';
import { sendMessage, sendChatAction, answerCallbackQuery, editMessageText, deleteMessage } from '@/lib/telegram';
import { addTurn } from '@/lib/kakao-history';
import { generateReply, generateFirstReading, extractAndValidateProfile, calculateSajuFromAPI } from '@/lib/kakao-service';
import {
  getProfile,
  upsertProfile,
  deleteProfile,
  getDbHistory,
  addDbTurn,
  isPremiumUser,
  processReferral,
  getReferralCode,
  getFreeUnlocks,
  useFreeUnlock,
  buildReferralLink,
} from '@/lib/user-profile';
import type { UserProfile } from '@/lib/user-profile';
import { trackInterest } from '@/lib/interest-helpers';
import { getLatestLogId, markOpened, markPremiumConverted } from '@/lib/push-logger';
import { generateFullDailyMessage, generateHintMessage } from '@/lib/daily_message_generator';
import {
  isCompatibilityQuestion,
  getPartnerProfileRequest,
  generateCompatibilityAnalysis,
} from '@/lib/compatibility';
import {
  isWealthQuestion,
  generateWealthAnalysis,
} from '@/lib/wealth-analysis';
import {
  setPendingAction,
  getPendingAction,
  deletePendingAction,
} from '@/lib/pending-actions';
import { checkSpamThrottle, checkDailyLimit, getUserTier, incrementDailyUsage } from '@/lib/rate-limiter';

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

const PROGRESS_STAGES = [
  { pct: 15, label: '사주 명식 계산 중' },
  { pct: 35, label: '고서 참조 검색 중' },
  { pct: 55, label: '사주 구조 분석 중' },
  { pct: 75, label: '사주 풀이 중' },
  { pct: 90, label: '거의 다 됐어' },
];

const COMPAT_PROGRESS_STAGES = [
  { pct: 10, label: '두 사람 사주 계산 중' },
  { pct: 25, label: '일간 관계 분석 중' },
  { pct: 40, label: '지지 충합 확인 중' },
  { pct: 55, label: '오행 보완 분석 중' },
  { pct: 70, label: '궁합 점수 계산 중' },
  { pct: 85, label: '관계 풀이 작성 중' },
  { pct: 95, label: '거의 다 됐어 💕' },
];

const WEALTH_PROGRESS_STAGES = [
  { pct: 10, label: '재성 구조 분석 중' },
  { pct: 25, label: '식상 생산력 확인 중' },
  { pct: 40, label: '비겁 손재 위험 체크 중' },
  { pct: 55, label: '년운 재물 흐름 분석 중' },
  { pct: 70, label: '투자 타이밍 계산 중' },
  { pct: 85, label: '재물 전략 수립 중' },
  { pct: 95, label: '거의 다 됐어 💰' },
];

const PROGRESS_INTERVAL_MS = 2000;

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function buildProgressText(header: string, pct: number, label: string): string {
  return `${header}\n\n${buildProgressBar(pct)} ${pct}%\n${label}`;
}

// --- Freemium blur helpers ---

interface ParsedReply {
  freeText: string;
  premiumText: string;
  hasPremium: boolean;
}

function parseFreemiumSections(raw: string): ParsedReply {
  const freeMatch = raw.match(/\[FREE\]([\s\S]*?)\[\/FREE\]/);
  const premiumMatch = raw.match(/\[PREMIUM\]([\s\S]*?)\[\/PREMIUM\]/);

  if (!freeMatch && !premiumMatch) {
    // No markers — treat entire reply as free
    return { freeText: raw, premiumText: '', hasPremium: false };
  }

  const freeText = (freeMatch?.[1] ?? '').trim();
  const premiumText = (premiumMatch?.[1] ?? '').trim();

  return { freeText, premiumText, hasPremium: !!premiumText };
}

function blurText(text: string): string {
  // Replace each word-like segment with █ blocks, preserving line breaks
  return text
    .split('\n')
    .map((line) =>
      line.replace(/\S+/g, (word) => '█'.repeat(Math.min(word.length, 6))),
    )
    .join('\n');
}

function cleanTags(text: string): string {
  return text
    .replace(/\[FREE\]|\[\/FREE\]|\[PREMIUM\]|\[\/PREMIUM\]/g, '')
    .trim();
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
        await answerCallbackQuery(callbackId);
        getLatestLogId(userId).then((logId) => {
          if (logId) markOpened(logId).catch(() => {});
        }).catch(() => {});

        const premium = await isPremiumUser('telegram', userId);

        if (premium) {
          // 유료 사용자 → 전체 풀이 즉시 발송
          await sendChatAction(chatId, 'typing');
          const fullMsg = await generateFullDailyMessage(chatId);
          await sendMessage(chatId, `🔓 *오늘의 전체 풀이*\n\n${fullMsg}`, { parseMode: 'Markdown' });
          getLatestLogId(userId).then((logId) => {
            if (logId) markPremiumConverted(logId).catch(() => {});
          }).catch(() => {});
        } else {
          // 무료 사용자 → 유료 안내 메시지
          await sendMessage(
            chatId,
            '🔮 *오늘의 전체 풀이를 열어볼까요?*\n\n' +
              '포함 내용:\n' +
              '✦ 블랭크 없는 상세 풀이\n' +
              '✦ 시간대별 운세 (2시간 단위)\n' +
              '✦ 오늘의 행운 포인트 3가지\n' +
              '✦ 주의해야 할 사람/상황\n\n' +
              '💎 1회 열람: 1,900원\n' +
              '💎 월간 구독: 9,900원/월 (매일 자동 전체 풀이)',
            {
              parseMode: 'Markdown',
              replyMarkup: {
                inline_keyboard: [
                  [
                    { text: '💎 1회 결제', callback_data: 'premium_once' },
                    { text: '💎 월간 구독', callback_data: 'premium_monthly' },
                  ],
                  [{ text: '다음에 할게요', callback_data: 'premium_skip' }],
                ],
              },
            },
          );
        }
        break;
      }

      case 'premium_once':
      case 'premium_monthly': {
        // TODO: 실제 결제 연동 시 여기에 PG 플로우 추가
        await answerCallbackQuery(callbackId);
        await sendMessage(
          chatId,
          '💎 *결제 시스템 준비 중*\n\n' +
            '곧 결제 기능이 오픈됩니다!\n' +
            '오픈 시 가장 먼저 알려드릴게요 🙌',
          { parseMode: 'Markdown' },
        );
        break;
      }

      case 'premium_skip': {
        await answerCallbackQuery(callbackId);
        await sendMessage(chatId, '알겠어요! 대신 오늘의 힌트 하나만 드릴게요 💫');
        await sendChatAction(chatId, 'typing');
        const hint = await generateHintMessage(chatId);
        await sendMessage(chatId, hint);
        break;
      }

      case 'premium_unlock': {
        await answerCallbackQuery(callbackId);
        const premium = await isPremiumUser('telegram', userId);
        const freeUnlocks = await getFreeUnlocks('telegram', userId);
        const dbHist = await getDbHistory('telegram', userId);
        const lastAssistant = [...dbHist].reverse().find((h) => h.role === 'assistant');
        const lastUser = [...dbHist].reverse().find((h) => h.role === 'user');

        // 궁합 분석인지 확인
        const isCompatibility = lastAssistant?.content?.includes('궁합 분석') ||
                                lastAssistant?.content?.includes('💕 궁합') ||
                                lastUser?.content?.includes('궁합');

        // 무료 열람권이 있는 경우
        if (freeUnlocks > 0) {
          const used = await useFreeUnlock('telegram', userId);
          if (used && lastAssistant) {
            const fullText = cleanTags(lastAssistant.content);
            const remaining = freeUnlocks - 1;
            await sendMessage(
              chatId,
              `🎁 *무료 열람권 사용!* (남은 횟수: ${remaining}회)\n\n${fullText}\n\n` +
                '───────────────\n' +
                '💡 친구에게 공유하면 무료 열람권을 더 받을 수 있어요!',
              {
                parseMode: 'Markdown',
                replyMarkup: {
                  inline_keyboard: [
                    [{ text: '🔗 친구 초대하고 열람권 받기', callback_data: 'get_referral_link' }],
                  ],
                },
              },
            );
            return;
          }
        }

        if (premium) {
          // 유료 사용자 → DB에서 마지막 어시스턴트 답변 full 버전 발송
          if (lastAssistant) {
            const fullText = cleanTags(lastAssistant.content);
            await sendMessage(chatId, `🔓 *전체 풀이*\n\n${fullText}`, { parseMode: 'Markdown' });
          } else {
            await sendMessage(chatId, '이전 분석 내역을 찾을 수 없습니다. 질문을 다시 보내주세요!');
          }
        } else if (isCompatibility) {
          // 궁합 분석 → 19금 맞춤 전환 메시지
          await sendMessage(
            chatId,
            '*솔직히 말해도 돼?* 🔥\n\n' +
              '아까 분석하면서 *침대 궁합*도 봤거든.\n' +
              '이건 좀... 민감해서 블러 처리했어.\n\n' +
              '근데 네가 궁금해하는 거,\n' +
              '결국 *몸이 맞는지*랑 *오래갈 수 있는지*잖아.\n\n' +
              '블러 안에 있는 거:\n' +
              '→ *🔥 침대에서 둘이 어떤지* (노골적)\n' +
              '→ *💣 이 관계 터질 수 있는 지점*\n' +
              '→ *💍 결혼하면 어떻게 되는지*\n' +
              '→ *🎯 이 사람 꽉 잡는 법*\n\n' +
              '솔직히, 사귀기 전에 이거 모르면\n' +
              '나중에 후회할 수도 있어.\n\n' +
              '💎 *1,900원* — 19금 궁합 전체\n' +
              '💎 *9,900원/월* — 무제한 상담',
            {
              parseMode: 'Markdown',
              replyMarkup: {
                inline_keyboard: [
                  [{ text: '🔥 19금 궁합 열기', callback_data: 'premium_once' }],
                  [{ text: '💎 무제한 상담', callback_data: 'premium_monthly' }],
                  [{ text: '괜찮아, 담에', callback_data: 'premium_skip_compat' }],
                ],
              },
            },
          );
        } else {
          // 일반 사주 분석 → 기존 전환 메시지
          await sendMessage(
            chatId,
            '*아까 분석에서 시기가 나왔어*\n\n' +
              '네가 지금 고민하는 그거,\n' +
              '언제 움직여야 하는지 *정확한 타이밍*이 보여.\n\n' +
              '근데 이 시기가 생각보다 빨라.\n' +
              '모르고 넘어가면... 나중에 "그때 왜 안 봤지" 할 수도.\n\n' +
              '블러 안에 있는 거:\n' +
              '→ *움직여야 할 정확한 시점*\n' +
              '→ *절대 피해야 할 날*\n' +
              '→ *지금 당장 해야 할 한 가지*\n\n' +
              '💎 *1,900원* — 이 질문의 핵심 답\n' +
              '💎 *9,900원/월* — 무제한 상담',
            {
              parseMode: 'Markdown',
              replyMarkup: {
                inline_keyboard: [
                  [{ text: '⚡ 핵심 답변 열기', callback_data: 'premium_once' }],
                  [{ text: '🔥 무제한 상담', callback_data: 'premium_monthly' }],
                  [{ text: '괜찮아, 담에', callback_data: 'premium_skip_chat' }],
                ],
              },
            },
          );
        }
        break;
      }

      case 'premium_skip_chat': {
        await answerCallbackQuery(callbackId);
        await sendMessage(
          chatId,
          '알겠어.\n\n' +
            '근데 솔직히,\n' +
            '아까 분석하면서 본 그 *타이밍*...\n' +
            '네가 지금 결정 못 내리고 있는 거랑 딱 맞물려 있거든.\n\n' +
            '나중에 "그때 그거 뭐였지?" 싶으면 다시 물어봐.\n' +
            '그때까지 기운이 안 바뀌었으면 좋겠는데 🔮',
        );
        break;
      }

      case 'premium_skip_compat': {
        await answerCallbackQuery(callbackId);
        await sendMessage(
          chatId,
          '알겠어.\n\n' +
            '근데 아까 본 그 *침대 궁합*...\n' +
            '솔직히 좀 의외였거든. 🔥\n\n' +
            '나중에 "그때 뭐라고 했더라?" 싶으면\n' +
            '다시 궁합 물어봐. 그때도 말해줄게.\n\n' +
            '이 사람이랑 잘 됐으면 좋겠다 💕',
        );
        break;
      }

      case 'get_referral_link': {
        await answerCallbackQuery(callbackId);
        const referralCode = await getReferralCode('telegram', userId);
        if (referralCode) {
          const link = buildReferralLink(referralCode);
          await sendMessage(
            chatId,
            '🔗 *친구 초대 링크*\n\n' +
              `${link}\n\n` +
              '이 링크로 친구가 가입하면:\n' +
              '✦ 친구에게 무료 열람권 1회\n' +
              '✦ 나에게도 무료 열람권 1회!\n\n' +
              '링크를 복사해서 친구에게 공유해보세요 💫',
            { parseMode: 'Markdown' },
          );
        } else {
          await sendMessage(chatId, '추천 링크 생성에 실패했어요. 다시 시도해주세요!');
        }
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
    // 0. Rate limiting — 스팸 방지
    const spamCheck = checkSpamThrottle(userId);
    if (!spamCheck.allowed) {
      await sendMessage(chatId, spamCheck.message ?? '잠시 후 다시 시도해주세요.');
      return;
    }

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

    // 4-1. /invite 명령어: 친구 초대 링크
    if (utterance === '/invite') {
      const referralCode = await getReferralCode('telegram', userId);
      const freeUnlocks = await getFreeUnlocks('telegram', userId);
      if (referralCode) {
        const link = buildReferralLink(referralCode);
        await sendMessage(
          chatId,
          '🔗 *친구 초대 링크*\n\n' +
            `${link}\n\n` +
            '이 링크로 친구가 가입하면:\n' +
            '✦ 친구에게 무료 열람권 1회\n' +
            '✦ 나에게도 무료 열람권 1회!\n\n' +
            `현재 내 무료 열람권: *${freeUnlocks}회*\n\n` +
            '링크를 복사해서 친구에게 공유해보세요 💫',
          { parseMode: 'Markdown' },
        );
      } else {
        await sendMessage(
          chatId,
          '먼저 프로필을 등록해주세요!\n\n예: 1994년 10월 3일 오후 7시 30분 여성',
        );
      }
      return;
    }

    // 5. 프로필이 없으면 — 생년월일 파싱 → 저장 → 무료 첫 분석 자동 발송
    if (!profile) {
      const saved = await tryParseAndSaveProfile(userId, utterance, displayName);
      if (saved) {
        // 추천 코드 처리 (대기 중인 경우)
        const pendingRef = await getPendingAction('telegram', userId, 'referral');
        const pendingRefCode = pendingRef?.payload?.code as string | undefined;
        let referralBonus = '';
        if (pendingRefCode) {
          await deletePendingAction('telegram', userId, 'referral');
          const result = await processReferral('telegram', userId, pendingRefCode);
          if (result.success) {
            referralBonus = '\n\n🎁 *친구 추천 보상!* 무료 열람권 1회가 지급되었어요!';
          }
        }

        await sendMessage(
          chatId,
          `프로필을 저장했어요! 🎉\n\n` +
            `생년월일: ${saved.birth_year}년 ${saved.birth_month}월 ${saved.birth_day}일\n` +
            `시간: ${saved.birth_hour}시 ${saved.birth_minute}분\n` +
            `성별: ${saved.gender}` +
            referralBonus +
            `\n\n지금 바로 무료 사주 분석을 시작할게요...`,
          { parseMode: 'Markdown' },
        );

        // 첫 분석 진행률 표시 + 생성
        const firstReadingProfile = {
          year: String(saved.birth_year),
          month: String(saved.birth_month),
          day: String(saved.birth_day),
          hour: String(saved.birth_hour),
          minute: String(saved.birth_minute),
          gender: saved.gender as '남성' | '여성',
        };

        const header = '🔮 사주 깊이 읽는 중...';
        const progressResult = await sendMessage(
          chatId,
          buildProgressText(header, 0, '분석 시작'),
        );
        const progressMsgId = progressResult.messageId;

        let step = 0;
        const progressInterval = setInterval(() => {
          if (step < PROGRESS_STAGES.length && progressMsgId) {
            const stage = PROGRESS_STAGES[step];
            editMessageText(
              chatId,
              progressMsgId,
              buildProgressText(header, stage.pct, stage.label),
            ).catch(() => {});
            step++;
          }
        }, PROGRESS_INTERVAL_MS);

        const firstReading = await generateFirstReading(firstReadingProfile, displayName);
        clearInterval(progressInterval);
        if (progressMsgId) await deleteMessage(chatId, progressMsgId).catch(() => {});

        // 첫 분석 결과 발송 — Telegram에서 ### 마크다운 헤더 깨짐 방지
        const cleanedReading = firstReading.replace(/^#{1,6}\s*/gm, '');
        await addDbTurn('telegram', userId, 'assistant', cleanedReading);
        await sendMessage(chatId, cleanedReading);

        // 후속 질문 유도
        await sendMessage(
          chatId,
          '궁금한 거 있으면 편하게 물어봐! 💬\n\n' +
            '예시:\n' +
            '• "올해 연애운 어때?"\n' +
            '• "이직할 타이밍인가?"\n' +
            '• "이번 달 재물운 알려줘"',
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

    // 6. 궁합 분석 플로우
    const pendingCompat = await getPendingAction('telegram', userId, 'compatibility');
    if (pendingCompat) {
      // 상대방 프로필 대기 중 — 파싱 시도
      const partnerParsed = extractAndValidateProfile(utterance);
      if (partnerParsed) {
        const compatQuestion = (pendingCompat.payload?.question as string) ?? '';
        await deletePendingAction('telegram', userId, 'compatibility');

        // 진행률 표시 시작
        const compatHeader = '💕 *궁합 분석 중...*';
        const progressResult = await sendMessage(
          chatId,
          buildProgressText(compatHeader, 0, '시작'),
          { parseMode: 'Markdown' },
        );
        const progressMsgId = progressResult.messageId;

        let compatStep = 0;
        const compatProgressInterval = setInterval(() => {
          if (compatStep < COMPAT_PROGRESS_STAGES.length && progressMsgId) {
            const stage = COMPAT_PROGRESS_STAGES[compatStep];
            editMessageText(
              chatId,
              progressMsgId,
              buildProgressText(compatHeader, stage.pct, stage.label),
            ).catch(() => {});
            compatStep++;
          }
        }, PROGRESS_INTERVAL_MS);

        const myProfile = {
          year: String(profile.birth_year),
          month: String(profile.birth_month),
          day: String(profile.birth_day),
          hour: String(profile.birth_hour),
          minute: String(profile.birth_minute),
          gender: profile.gender as '남성' | '여성',
        };
        const partnerProfile = {
          year: partnerParsed.year,
          month: partnerParsed.month,
          day: partnerParsed.day,
          hour: partnerParsed.hour ?? '12',
          minute: partnerParsed.minute ?? '0',
          gender: (partnerParsed.gender ?? '여성') as '남성' | '여성',
        };

        try {
          const [mySaju, partnerSaju] = await Promise.all([
            calculateSajuFromAPI(myProfile),
            calculateSajuFromAPI(partnerProfile),
          ]);

          const result = await generateCompatibilityAnalysis(
            mySaju,
            partnerSaju,
            myProfile,
            partnerProfile,
            compatQuestion,
          );

          // 진행률 정리
          clearInterval(compatProgressInterval);
          if (progressMsgId) {
            await deleteMessage(chatId, progressMsgId).catch(() => {});
          }

          // FREE/PREMIUM 파싱 — 차트(태그 바깥)가 잘리지 않도록 처리
          const parsed = parseFreemiumSections(result);
          const beforeFree = result.split('[FREE]')[0]?.trim() ?? '';

          if (parsed.hasPremium) {
            const blurred = blurText(parsed.premiumText);
            const displayText =
              (beforeFree ? beforeFree + '\n\n' : '') +
              parsed.freeText +
              '\n\n🔒 *더 솔직한 이야기*\n' +
              blurred +
              '\n\n_침대 궁합, 숨겨진 문제, 결혼 전망..._';

            await sendMessage(chatId, displayText, {
              parseMode: 'Markdown',
              replyMarkup: {
                inline_keyboard: [
                  [{ text: '🔥 19금 궁합 보기', callback_data: 'premium_unlock' }],
                ],
              },
            });
          } else {
            await sendMessage(chatId, result, { parseMode: 'Markdown' });
          }

          // DB에 저장
          await addDbTurn('telegram', userId, 'user', `궁합 질문: ${compatQuestion}`);
          await addDbTurn('telegram', userId, 'assistant', result);
        } catch (err) {
          clearInterval(compatProgressInterval);
          if (progressMsgId) {
            await deleteMessage(chatId, progressMsgId).catch(() => {});
          }
          console.error('[telegram] compatibility analysis error:', err);
          await sendMessage(chatId, '궁합 분석 중 오류가 발생했어요. 다시 시도해주세요!');
        }
        return;
      } else {
        // 파싱 실패 — 다시 요청
        await sendMessage(
          chatId,
          '생년월일 형식을 확인해주세요!\n\n예: 1995년 3월 15일 오후 2시 남성',
        );
        return;
      }
    }

    // 궁합 질문 감지 → 상대방 프로필 요청
    if (isCompatibilityQuestion(utterance)) {
      await setPendingAction('telegram', userId, 'compatibility', { question: utterance });
      await sendMessage(chatId, getPartnerProfileRequest(), { parseMode: 'Markdown' });
      return;
    }

    // 재물운 전문 분석 감지
    if (isWealthQuestion(utterance)) {
      // 진행률 표시 시작
      const wealthHeader = '💰 *재물운 깊이 분석 중...*';
      const progressResult = await sendMessage(
        chatId,
        buildProgressText(wealthHeader, 0, '시작'),
        { parseMode: 'Markdown' },
      );
      const progressMsgId = progressResult.messageId;

      let wealthStep = 0;
      const wealthProgressInterval = setInterval(() => {
        if (wealthStep < WEALTH_PROGRESS_STAGES.length && progressMsgId) {
          const stage = WEALTH_PROGRESS_STAGES[wealthStep];
          editMessageText(
            chatId,
            progressMsgId,
            buildProgressText(wealthHeader, stage.pct, stage.label),
          ).catch(() => {});
          wealthStep++;
        }
      }, PROGRESS_INTERVAL_MS);

      try {
        const storedBirthProfile = {
          year: String(profile.birth_year),
          month: String(profile.birth_month),
          day: String(profile.birth_day),
          hour: String(profile.birth_hour),
          minute: String(profile.birth_minute),
          gender: profile.gender as '남성' | '여성',
        };

        const saju = await calculateSajuFromAPI(storedBirthProfile);
        const result = await generateWealthAnalysis(saju, storedBirthProfile, utterance);

        // 진행률 정리
        clearInterval(wealthProgressInterval);
        if (progressMsgId) {
          await deleteMessage(chatId, progressMsgId).catch(() => {});
        }

        // FREE/PREMIUM 파싱
        const parsed = parseFreemiumSections(result);
        const beforeFree = result.split('[FREE]')[0]?.trim() ?? '';

        // DB 저장
        await addDbTurn('telegram', userId, 'user', utterance);
        await addDbTurn('telegram', userId, 'assistant', result);

        if (parsed.hasPremium) {
          const blurred = blurText(parsed.premiumText);
          const displayText =
            (beforeFree ? beforeFree + '\n\n' : '') +
            parsed.freeText +
            '\n\n🔒 *진짜 돈 되는 정보는 여기부터*\n' +
            blurred +
            '\n\n_투자 타이밍, 피해야 할 것, 5년 전망..._';

          await sendMessage(chatId, displayText, {
            parseMode: 'Markdown',
            replyMarkup: {
              inline_keyboard: [
                [{ text: '💰 재물 핵심 정보 열기', callback_data: 'premium_unlock' }],
              ],
            },
          });
        } else {
          await sendMessage(chatId, result, { parseMode: 'Markdown' });
        }
      } catch (err) {
        clearInterval(wealthProgressInterval);
        if (progressMsgId) {
          await deleteMessage(chatId, progressMsgId).catch(() => {});
        }
        console.error('[telegram] wealth analysis error:', err);
        await sendMessage(chatId, '재물운 분석 중 오류가 발생했어요. 다시 시도해주세요!');
      }
      return;
    }

    // 7. DB 히스토리 로드 + 사용자 발화 저장
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

    // 8. 분석 즉시 시작 + 중간 메시지 병렬 준비
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
      // 3초 초과 — 진행률 표시 메시지 발송 + 실시간 업데이트
      const interimMsg = await interimPromise;
      const header = `${interimMsg}\n\n🔮 사주 깊이 읽는 중...`;
      const progressResult = await sendMessage(
        chatId,
        buildProgressText(header, 0, '분석 시작'),
      );
      const progressMsgId = progressResult.messageId;

      let step = 0;
      const progressInterval = setInterval(() => {
        if (step < PROGRESS_STAGES.length && progressMsgId) {
          const stage = PROGRESS_STAGES[step];
          editMessageText(
            chatId,
            progressMsgId,
            buildProgressText(header, stage.pct, stage.label),
          ).catch(() => {});
          step++;
        }
      }, PROGRESS_INTERVAL_MS);

      reply = await analysisPromise;
      clearInterval(progressInterval);

      // 진행률 메시지 삭제
      if (progressMsgId) {
        await deleteMessage(chatId, progressMsgId).catch(() => {});
      }
    }

    // 9. 답변 저장 (full) + 블러 처리 후 발송
    // Telegram에서 ### 마크다운 헤더 깨짐 방지
    reply = reply.replace(/^#{1,6}\s*/gm, '');
    await addDbTurn('telegram', userId, 'assistant', reply);
    addTurn(userId, 'assistant', reply);

    const parsed = parseFreemiumSections(reply);
    if (parsed.hasPremium) {
      // FREE 부분 발송 + PREMIUM 부분 블러 처리
      const blurred = blurText(parsed.premiumText);

      // 사용자 질문 맥락에 따른 티저 생성
      const questionLower = utterance.toLowerCase();
      let teaser = '🔒 *진짜 중요한 건 여기부터야*';
      if (/연애|사랑|그\s?사람|썸|결혼|이별|재회/.test(questionLower)) {
        teaser = '🔒 *근데 그 사람 마음은...*';
      } else if (/돈|재물|투자|사업|주식|코인|부업/.test(questionLower)) {
        teaser = '🔒 *돈 들어오는 타이밍이...*';
      } else if (/취업|이직|회사|직장|면접|합격/.test(questionLower)) {
        teaser = '🔒 *붙는 시기가 보여*';
      } else if (/언제|시기|타이밍|시점/.test(questionLower)) {
        teaser = '🔒 *정확한 시기를 말해줄게*';
      } else if (/어떻게|방법|뭘\s?해야|어쩌지/.test(questionLower)) {
        teaser = '🔒 *구체적으로 이렇게 해*';
      }

      const displayText =
        parsed.freeText +
        `\n\n${teaser}\n` +
        blurred +
        '\n\n_이 부분이 네 질문의 핵심 답이야_';

      await sendMessage(chatId, displayText, {
        parseMode: 'Markdown',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '👆 핵심 답변 열기', callback_data: 'premium_unlock' }],
          ],
        },
      });
    } else {
      await sendMessage(chatId, reply);
    }
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

    // /start 명령어 처리 (추천 링크 포함)
    if (utterance.startsWith('/start')) {
      const profile = await getProfile('telegram', userId);

      // 추천 코드 파싱: /start ref_XXXXXX
      const refMatch = utterance.match(/\/start\s+ref_([A-Z0-9]+)/i);
      if (refMatch && !profile) {
        // 신규 사용자 + 추천 코드 있음 → Supabase에 저장 (프로필 등록 후 처리)
        await setPendingAction('telegram', userId, 'referral', {
          code: refMatch[1].toUpperCase(),
        });
      }

      if (profile) {
        await sendMessage(
          chatId,
          `다시 오셨군요, ${profile.display_name ?? ''}님! 반가워요.\n\n` +
            `저장된 프로필로 바로 분석해드릴게요.\n` +
            `궁금한 점을 자유롭게 물어보세요!\n\n` +
            `명령어:\n/profile - 내 프로필 보기\n/reset - 프로필 초기화`,
        );
      } else {
        const welcomeMsg = refMatch
          ? '🎁 *친구 추천으로 오셨군요!*\n\n' +
            '프로필 등록하면 무료 열람권 1회를 드릴게요!\n\n' +
            '생년월일시와 성별을 알려주세요.\n' +
            '예: 1994년 10월 3일 오후 7시 30분 여성'
          : '안녕하세요! AI 사주 분석 서비스입니다.\n\n' +
            '생년월일시와 성별을 알려주세요.\n' +
            '예: 1994년 10월 3일 오후 7시 30분 여성\n\n' +
            '한 번 등록하면 다음부터는 바로 질문할 수 있어요!';
        await sendMessage(chatId, welcomeMsg, { parseMode: 'Markdown' });
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
