/**
 * 카카오 오픈빌더 스킬서버 핵심 비즈니스 로직.
 * 텔레그램 webhook/route.ts의 handleMessage/handleCallbackQuery에 대응.
 */

import type { KakaoSkillRequest, KakaoSkillResponse } from './kakao-types';
import {
  simpleTextResponse,
  textCardResponse,
  multiOutputResponse,
  errorResponse,
  quickReply,
  defaultQuickReplies,
  afterProfileQuickReplies,
  premiumQuickReplies,
} from './kakao-response-builder';
import { sendCallbackResponse } from './kakao-callback';
import {
  telegramToPlainText,
  parseAndFormatFreemium,
  stripTagsAndFormat,
  splitForKakao,
} from './kakao-text-formatter';
import {
  generateReply,
  generateFirstReading,
  extractAndValidateProfile,
  calculateSajuFromAPI,
} from './kakao-service';
import {
  getProfile,
  upsertProfile,
  deleteProfile,
  getDbHistory,
  addDbTurn,
  isPremiumUser,
  getFreeUnlocks,
  useFreeUnlock,
  getReferralCode,
  processReferral,
} from './user-profile';
import type { UserProfile } from './user-profile';
import { trackInterest } from './interest-helpers';
import {
  isCompatibilityQuestion,
  getPartnerProfileRequest,
  generateCompatibilityAnalysis,
} from './compatibility';
import {
  isWealthQuestion,
  generateWealthAnalysis,
} from './wealth-analysis';
import {
  setPendingAction,
  getPendingAction,
  deletePendingAction,
} from './pending-actions';
import { checkSpamThrottle, checkDailyLimit, getUserTier, incrementDailyUsage } from './rate-limiter';
import { createOrder, buildPaymentUrl, getUserCredits, useCredit } from './payment';
import type { ProductKey } from './payment';
import { generateDailyFortune } from './daily-fortune';
import { isAuspiciousDayQuestion, analyzeAuspiciousDays, formatAuspiciousDays } from './fortune-calendar';
import type { EventType } from './fortune-calendar';

const PLATFORM = 'kakao' as const;

// --- 특수 명령 prefix ---
const CMD = {
  UNLOCK_PREMIUM: '__unlock_premium__',
  USE_FREE_UNLOCK: '__use_free_unlock__',
  CMD_PROFILE: '__cmd_profile__',
  CMD_RESET: '__cmd_reset__',
  CMD_INVITE: '__cmd_invite__',
  CMD_HELP: '__cmd_help__',
  CMD_DAILY: '__cmd_daily__',
  CMD_CREDITS: '__cmd_credits__',
  CMD_SUBSCRIBE: '__cmd_subscribe__',
} as const;

/**
 * 즉시 응답이 가능한 경우 KakaoSkillResponse를 반환.
 * 비동기 처리가 필요하면 callback을 fire하고 null을 반환 (route에서 useCallback:true).
 */
export async function handleKakaoMessage(
  request: KakaoSkillRequest,
): Promise<{ response: KakaoSkillResponse | null; needsCallback: boolean }> {
  const utterance = request.userRequest.utterance?.trim() ?? '';
  const userId = request.userRequest.user?.id ?? 'anonymous';
  const callbackUrl = request.userRequest.callbackUrl;

  // 1. 특수 명령 처리 (항상 즉시 응답)
  if (utterance.startsWith('__')) {
    const response = await handleSpecialCommand(userId, utterance);
    return { response, needsCallback: false };
  }

  // 2. 프로필 확인
  const profile = await getProfile(PLATFORM, userId);

  // 2.5 Rate limiting — 스팸 방지
  const spamCheck = checkSpamThrottle(userId);
  if (!spamCheck.allowed) {
    return {
      response: simpleTextResponse(spamCheck.message ?? '잠시 후 다시 시도해주세요.'),
      needsCallback: false,
    };
  }

  // 3. 프로필 없음 → 등록 플로우
  if (!profile) {
    const result = await handleNoProfile(userId, utterance, callbackUrl);
    return result;
  }

  // 4. 궁합 대기 상태 확인
  const pendingCompat = await getPendingAction(PLATFORM, userId, 'compatibility');
  if (pendingCompat) {
    const result = await handleCompatibilityPending(
      userId,
      utterance,
      callbackUrl,
      profile,
      pendingCompat.payload as { question: string },
    );
    return result;
  }

  // 5. 궁합 질문 감지
  if (isCompatibilityQuestion(utterance)) {
    await setPendingAction(PLATFORM, userId, 'compatibility', {
      question: utterance,
    });
    const partnerRequest = getPartnerProfileRequest();
    // 마크다운 제거 후 카카오 포맷
    const plainRequest = telegramToPlainText(partnerRequest);
    return {
      response: simpleTextResponse(plainRequest),
      needsCallback: false,
    };
  }

  // 5.5 택일 질문 감지
  const eventType = isAuspiciousDayQuestion(utterance);
  if (eventType && profile) {
    return await handleAuspiciousDayQuestion(userId, profile, eventType, utterance);
  }

  // 6. 재물운 질문 감지 → callback
  if (isWealthQuestion(utterance)) {
    if (callbackUrl) {
      fireWealthAnalysis(userId, utterance, callbackUrl, profile);
      return { response: null, needsCallback: true };
    }
    // callback 없으면 타임아웃 내 시도
    return await handleWealthSync(userId, utterance, profile);
  }

  // 6.5 Daily limit check (before analysis)
  const tier = await getUserTier(PLATFORM, userId);
  const limitCheck = await checkDailyLimit(PLATFORM, userId, tier);
  if (!limitCheck.allowed) {
    return {
      response: simpleTextResponse(
        limitCheck.message ?? '오늘 사용 횟수를 모두 사용했어요.',
        [
          quickReply('크레딧 충전', '__cmd_credits__'),
          quickReply('구독하기', '__cmd_subscribe__'),
          quickReply('오늘의 운세', '__cmd_daily__'),
        ],
      ),
      needsCallback: false,
    };
  }

  // 7. 일반 사주 질문 → callback
  if (callbackUrl) {
    fireGeneralAnalysis(userId, utterance, callbackUrl, profile);
    return { response: null, needsCallback: true };
  }

  // callback 없으면 타임아웃 내 시도
  return await handleGeneralSync(userId, utterance, profile);
}

// ==========================================
// 특수 명령 처리
// ==========================================

async function handleSpecialCommand(
  userId: string,
  command: string,
): Promise<KakaoSkillResponse> {
  switch (command) {
    case CMD.UNLOCK_PREMIUM:
      return await handlePremiumUnlock(userId);

    case CMD.USE_FREE_UNLOCK:
      return await handleFreeUnlockUse(userId);

    case CMD.CMD_PROFILE:
      return await handleShowProfile(userId);

    case CMD.CMD_RESET:
      return await handleResetProfile(userId);

    case CMD.CMD_INVITE:
      return await handleInvite(userId);

    case CMD.CMD_HELP:
      return simpleTextResponse(
        '사주 분석 AI에 오신 걸 환영해요!\n\n' +
          '아래 버튼을 눌러 기능을 선택하거나, 자유롭게 질문해주세요.',
        defaultQuickReplies(),
      );

    case CMD.CMD_DAILY:
      return await handleDailyFortune(userId);

    case CMD.CMD_CREDITS:
      return await handleCreditsInfo(userId);

    case CMD.CMD_SUBSCRIBE:
      return await handleCreditsInfo(userId);

    // Payment purchase commands
    case '__buy_credit_10__':
    case '__buy_credit_30__':
    case '__buy_monthly_basic__':
    case '__buy_monthly_premium__': {
      const productMap: Record<string, string> = {
        '__buy_credit_10__': 'CREDIT_10',
        '__buy_credit_30__': 'CREDIT_30',
        '__buy_monthly_basic__': 'MONTHLY_BASIC',
        '__buy_monthly_premium__': 'MONTHLY_PREMIUM',
      };
      const productKey = productMap[command];
      if (productKey) {
        const order = await createOrder(PLATFORM, userId, productKey as ProductKey);
        if (order) {
          const url = buildPaymentUrl(order.order_id, productKey as ProductKey);
          return textCardResponse(
            '결제 페이지로 이동합니다.',
            [{ label: '결제하기', action: 'webLink' as const, webLinkUrl: url }],
            [quickReply('돌아가기', '__cmd_help__')],
          );
        }
      }
      return errorResponse('결제 처리 중 오류가 발생했어요.');
    }

    default:
      return simpleTextResponse(
        '궁금한 거 있으면 편하게 물어봐!',
        defaultQuickReplies(),
      );
  }
}

async function handlePremiumUnlock(userId: string): Promise<KakaoSkillResponse> {
  const premium = await isPremiumUser(PLATFORM, userId);
  const freeUnlocks = await getFreeUnlocks(PLATFORM, userId);
  const dbHist = await getDbHistory(PLATFORM, userId);
  const lastAssistant = [...dbHist].reverse().find((h) => h.role === 'assistant');

  if (!lastAssistant) {
    return simpleTextResponse(
      '이전 분석 내역을 찾을 수 없어요. 질문을 다시 보내주세요!',
      defaultQuickReplies(),
    );
  }

  if (premium) {
    const fullText = stripTagsAndFormat(lastAssistant.content);
    const chunks = splitForKakao(fullText);
    return multiOutputResponse(chunks, afterProfileQuickReplies());
  }

  if (freeUnlocks > 0) {
    const used = await useFreeUnlock(PLATFORM, userId);
    if (used) {
      const fullText = stripTagsAndFormat(lastAssistant.content);
      const remaining = freeUnlocks - 1;
      const chunks = splitForKakao(
        `[무료 열람권 사용] (남은 횟수: ${remaining}회)\n\n${fullText}`,
      );
      return multiOutputResponse(chunks, [
        quickReply('친구 초대하기', CMD.CMD_INVITE),
        quickReply('다른 질문', '다른 질문할게'),
      ]);
    }
  }

  // 크레딧 확인
  const credits = await getUserCredits(PLATFORM, userId);
  if (credits > 0) {
    const used = await useCredit(PLATFORM, userId, 'premium_unlock');
    if (used) {
      const fullText = stripTagsAndFormat(lastAssistant.content);
      const chunks = splitForKakao(
        `[크레딧 사용] (남은 크레딧: ${credits - 1}개)\n\n${fullText}`,
      );
      return multiOutputResponse(chunks, afterProfileQuickReplies());
    }
  }

  // No credits, no free unlocks — offer payment
  const order = await createOrder(PLATFORM, userId, 'SINGLE_READING');
  if (order) {
    const url = buildPaymentUrl(order.order_id, 'SINGLE_READING');
    return textCardResponse(
      '아까 분석에서 시기가 나왔는데...\n\n' +
        '네가 지금 고민하는 그거,\n' +
        '언제 움직여야 하는지 정확한 타이밍이 보여.\n\n' +
        '💎 1,900원으로 핵심 답변을 확인하세요!',
      [{ label: '💎 핵심 답변 열기 (1,900원)', action: 'webLink' as const, webLinkUrl: url }],
      [
        quickReply('크레딧 충전', '__cmd_credits__'),
        quickReply('친구 초대로 무료', CMD.CMD_INVITE),
        quickReply('다른 질문', '다른 질문할게'),
      ],
      '핵심 답변 미리보기',
    );
  }

  return textCardResponse(
    '결제 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    undefined,
    [quickReply('다른 질문', '다른 질문할게')],
  );
}

async function handleFreeUnlockUse(userId: string): Promise<KakaoSkillResponse> {
  const freeUnlocks = await getFreeUnlocks(PLATFORM, userId);
  if (freeUnlocks <= 0) {
    return simpleTextResponse(
      '무료 열람권이 없어요.\n친구 초대하면 열람권을 받을 수 있어요!',
      [
        quickReply('친구 초대하기', CMD.CMD_INVITE),
        quickReply('다른 질문', '다른 질문할게'),
      ],
    );
  }
  // 동일한 로직으로 unlock 처리
  return await handlePremiumUnlock(userId);
}

async function handleShowProfile(userId: string): Promise<KakaoSkillResponse> {
  const profile = await getProfile(PLATFORM, userId);
  if (!profile) {
    return simpleTextResponse(
      '아직 등록된 프로필이 없어요.\n\n' +
        '생년월일시와 성별을 보내주시면 저장해드릴게요!\n' +
        '예: 1994년 10월 3일 오후 7시 30분 여성',
    );
  }
  return simpleTextResponse(
    `등록된 프로필 정보:\n\n` +
      `이름: ${profile.display_name ?? '미등록'}\n` +
      `생년월일: ${profile.birth_year}년 ${profile.birth_month}월 ${profile.birth_day}일\n` +
      `시간: ${profile.birth_hour}시 ${profile.birth_minute}분\n` +
      `성별: ${profile.gender}\n\n` +
      `수정하려면 아래 버튼을 눌러주세요.`,
    [
      quickReply('프로필 초기화', CMD.CMD_RESET),
      quickReply('사주 분석', '올해 운세 알려줘'),
    ],
  );
}

async function handleResetProfile(userId: string): Promise<KakaoSkillResponse> {
  await deleteProfile(PLATFORM, userId);
  return simpleTextResponse(
    '프로필이 초기화되었어요.\n\n' +
      '생년월일시와 성별을 다시 보내주세요!\n' +
      '예: 1994년 10월 3일 오후 7시 30분 여성',
  );
}

async function handleInvite(userId: string): Promise<KakaoSkillResponse> {
  const referralCode = await getReferralCode(PLATFORM, userId);
  const freeUnlocks = await getFreeUnlocks(PLATFORM, userId);
  if (!referralCode) {
    return simpleTextResponse(
      '먼저 프로필을 등록해주세요!\n\n예: 1994년 10월 3일 오후 7시 30분 여성',
    );
  }
  return simpleTextResponse(
    `친구 초대 코드\n\n` +
      `추천 코드: ${referralCode}\n\n` +
      `친구에게 이 코드를 알려주세요!\n` +
      `친구가 "추천 코드 ${referralCode}" 라고 입력하면:\n` +
      `- 친구에게 무료 열람권 1회\n` +
      `- 나에게도 무료 열람권 1회!\n\n` +
      `현재 내 무료 열람권: ${freeUnlocks}회`,
    [quickReply('다른 질문', '다른 질문할게')],
  );
}

// ==========================================
// 프로필 미등록 처리
// ==========================================

async function handleNoProfile(
  userId: string,
  utterance: string,
  callbackUrl?: string,
): Promise<{ response: KakaoSkillResponse | null; needsCallback: boolean }> {
  // 추천 코드 감지
  const refMatch = utterance.match(/추천\s*코드\s*([A-Z0-9]{4,8})/i);
  if (refMatch) {
    await setPendingAction(PLATFORM, userId, 'referral', {
      code: refMatch[1].toUpperCase(),
    });
    return {
      response: simpleTextResponse(
        '추천 코드를 확인했어요!\n\n' +
          '프로필 등록하면 무료 열람권 1회를 드릴게요.\n' +
          '생년월일시와 성별을 알려주세요.\n' +
          '예: 1994년 10월 3일 오후 7시 30분 여성',
      ),
      needsCallback: false,
    };
  }

  // 생년월일 파싱 시도
  const validated = extractAndValidateProfile(utterance);
  if (validated) {
    const saved = await upsertProfile({
      platform: PLATFORM,
      platform_user_id: userId,
      display_name: '카카오 사용자',
      birth_year: Number(validated.year),
      birth_month: Number(validated.month),
      birth_day: Number(validated.day),
      birth_hour: Number(validated.hour),
      birth_minute: Number(validated.minute),
      gender: validated.gender,
    });

    if (!saved) {
      return {
        response: errorResponse('프로필 저장 중 오류가 발생했어요. 다시 시도해주세요.'),
        needsCallback: false,
      };
    }

    // 추천 코드 처리
    const pendingRef = await getPendingAction(PLATFORM, userId, 'referral');
    let referralBonus = '';
    if (pendingRef) {
      await deletePendingAction(PLATFORM, userId, 'referral');
      const code = pendingRef.payload.code as string;
      const result = await processReferral(PLATFORM, userId, code);
      if (result.success) {
        referralBonus = '\n\n[친구 추천 보상] 무료 열람권 1회가 지급되었어요!';
      }
    }

    const confirmMsg =
      `프로필을 저장했어요!\n\n` +
      `생년월일: ${saved.birth_year}년 ${saved.birth_month}월 ${saved.birth_day}일\n` +
      `시간: ${saved.birth_hour}시 ${saved.birth_minute}분\n` +
      `성별: ${saved.gender}` +
      referralBonus +
      `\n\n지금 바로 무료 사주 분석을 시작할게요...`;

    // callback으로 첫 분석 시작
    if (callbackUrl) {
      // 프로필 확인 메시지는 callback 응답에 포함
      fireFirstReading(userId, saved, callbackUrl, confirmMsg);
      return { response: null, needsCallback: true };
    }

    // callback 없으면 확인 메시지만 보내고 다음 질문에서 분석
    return {
      response: simpleTextResponse(
        confirmMsg + '\n\n궁금한 거 있으면 물어봐!',
        afterProfileQuickReplies(),
      ),
      needsCallback: false,
    };
  }

  // 파싱 실패 → 안내
  return {
    response: simpleTextResponse(
      '맞춤 사주 분석을 위해 생년월일시와 성별을 알려주세요!\n\n' +
        '형식: YYYY년 M월 D일 (오전/오후) H시 M분 성별\n' +
        '예: 1994년 10월 3일 오후 7시 30분 여성\n\n' +
        '태어난 시간을 모르면 "시간 모름"이라고 적어주세요.',
    ),
    needsCallback: false,
  };
}

// ==========================================
// 궁합 대기 처리
// ==========================================

async function handleCompatibilityPending(
  userId: string,
  utterance: string,
  callbackUrl: string | undefined,
  profile: UserProfile,
  pendingPayload: { question: string },
): Promise<{ response: KakaoSkillResponse | null; needsCallback: boolean }> {
  // 상대방 프로필 파싱 시도
  const partnerParsed = extractAndValidateProfile(utterance);
  if (!partnerParsed) {
    return {
      response: simpleTextResponse(
        '생년월일 형식을 확인해주세요!\n\n예: 1995년 3월 15일 오후 2시 남성',
      ),
      needsCallback: false,
    };
  }

  await deletePendingAction(PLATFORM, userId, 'compatibility');

  if (callbackUrl) {
    fireCompatibilityAnalysis(
      userId,
      callbackUrl,
      profile,
      partnerParsed,
      pendingPayload.question,
    );
    return { response: null, needsCallback: true };
  }

  // callback 없으면 시도 (타임아웃 가능성 높음)
  return await handleCompatibilitySync(userId, profile, partnerParsed, pendingPayload.question);
}

// ==========================================
// Callback 비동기 처리 (fire-and-forget)
// ==========================================

function fireFirstReading(
  userId: string,
  profile: UserProfile,
  callbackUrl: string,
  confirmMsg: string,
): void {
  (async () => {
    try {
      const birthProfile = {
        year: String(profile.birth_year),
        month: String(profile.birth_month),
        day: String(profile.birth_day),
        hour: String(profile.birth_hour),
        minute: String(profile.birth_minute),
        gender: profile.gender as '남성' | '여성',
      };

      const firstReading = await generateFirstReading(birthProfile, profile.display_name ?? undefined);
      const formatted = telegramToPlainText(firstReading);

      await addDbTurn(PLATFORM, userId, 'assistant', firstReading);

      const fullText = `${confirmMsg}\n\n${'─'.repeat(20)}\n\n${formatted}`;
      const chunks = splitForKakao(fullText);

      await sendCallbackResponse(
        callbackUrl,
        multiOutputResponse(chunks, afterProfileQuickReplies()),
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[kakao-handler] firstReading callback error:', msg);
      await sendCallbackResponse(
        callbackUrl,
        errorResponse(`분석 중 오류가 발생했어요: ${msg}`),
      ).catch(() => {});
    }
  })();
}

function fireGeneralAnalysis(
  userId: string,
  utterance: string,
  callbackUrl: string,
  profile: UserProfile,
): void {
  (async () => {
    try {
      const storedBirthProfile = {
        year: String(profile.birth_year),
        month: String(profile.birth_month),
        day: String(profile.birth_day),
        hour: String(profile.birth_hour),
        minute: String(profile.birth_minute),
        gender: profile.gender as '남성' | '여성',
      };

      // DB 히스토리 로드 + 사용자 발화 저장
      const dbHistory = await getDbHistory(PLATFORM, userId);
      const history = dbHistory.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
        timestamp: Date.now(),
      }));
      await addDbTurn(PLATFORM, userId, 'user', utterance);

      // 관심사 추적 (fire-and-forget)
      trackInterest(PLATFORM, userId, utterance).catch((err) =>
        console.error('[kakao-handler] trackInterest error:', err),
      );

      const reply = await generateReply(utterance, history, storedBirthProfile);

      // DB에 full 답변 저장
      await addDbTurn(PLATFORM, userId, 'assistant', reply);

      // 일일 사용량 증가 (fire-and-forget)
      incrementDailyUsage(PLATFORM, userId).catch(() => {});

      // 프리미엄 파싱 + 카카오 포맷
      const parsed = parseAndFormatFreemium(reply, utterance);

      if (parsed.hasPremium) {
        const freeUnlocks = await getFreeUnlocks(PLATFORM, userId);
        const chunks = splitForKakao(parsed.displayText);
        await sendCallbackResponse(
          callbackUrl,
          multiOutputResponse(chunks, premiumQuickReplies(freeUnlocks > 0)),
        );
      } else {
        const formatted = telegramToPlainText(reply);
        const chunks = splitForKakao(formatted);
        await sendCallbackResponse(
          callbackUrl,
          multiOutputResponse(chunks, afterProfileQuickReplies()),
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[kakao-handler] generalAnalysis callback error:', msg);
      await sendCallbackResponse(
        callbackUrl,
        errorResponse(`분석 중 오류가 발생했어요: ${msg}`),
      ).catch(() => {});
    }
  })();
}

function fireWealthAnalysis(
  userId: string,
  utterance: string,
  callbackUrl: string,
  profile: UserProfile,
): void {
  (async () => {
    try {
      const storedBirthProfile = {
        year: String(profile.birth_year),
        month: String(profile.birth_month),
        day: String(profile.birth_day),
        hour: String(profile.birth_hour),
        minute: String(profile.birth_minute),
        gender: profile.gender as '남성' | '여성',
      };

      await addDbTurn(PLATFORM, userId, 'user', utterance);

      trackInterest(PLATFORM, userId, utterance).catch((err) =>
        console.error('[kakao-handler] trackInterest error:', err),
      );

      const saju = await calculateSajuFromAPI(storedBirthProfile);
      const result = await generateWealthAnalysis(saju, storedBirthProfile, utterance);

      await addDbTurn(PLATFORM, userId, 'assistant', result);

      // 일일 사용량 증가 (fire-and-forget)
      incrementDailyUsage(PLATFORM, userId).catch(() => {});

      const parsed = parseAndFormatFreemium(result, utterance);

      if (parsed.hasPremium) {
        const freeUnlocks = await getFreeUnlocks(PLATFORM, userId);
        const chunks = splitForKakao(parsed.displayText);
        await sendCallbackResponse(
          callbackUrl,
          multiOutputResponse(chunks, premiumQuickReplies(freeUnlocks > 0)),
        );
      } else {
        const formatted = telegramToPlainText(result);
        const chunks = splitForKakao(formatted);
        await sendCallbackResponse(
          callbackUrl,
          multiOutputResponse(chunks, afterProfileQuickReplies()),
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[kakao-handler] wealthAnalysis callback error:', msg);
      await sendCallbackResponse(
        callbackUrl,
        errorResponse(`재물운 분석 중 오류가 발생했어요: ${msg}`),
      ).catch(() => {});
    }
  })();
}

function fireCompatibilityAnalysis(
  userId: string,
  callbackUrl: string,
  profile: UserProfile,
  partnerParsed: { year: string; month: string; day: string; hour: string; minute: string; gender: '남성' | '여성' },
  question: string,
): void {
  (async () => {
    try {
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
        gender: partnerParsed.gender,
      };

      const [mySaju, partnerSaju] = await Promise.all([
        calculateSajuFromAPI(myProfile),
        calculateSajuFromAPI(partnerProfile),
      ]);

      const result = await generateCompatibilityAnalysis(
        mySaju,
        partnerSaju,
        myProfile,
        partnerProfile,
        question,
      );

      await addDbTurn(PLATFORM, userId, 'user', `궁합 질문: ${question}`);
      await addDbTurn(PLATFORM, userId, 'assistant', result);

      const parsed = parseAndFormatFreemium(result, question);

      if (parsed.hasPremium) {
        const freeUnlocks = await getFreeUnlocks(PLATFORM, userId);
        const chunks = splitForKakao(parsed.displayText);
        await sendCallbackResponse(
          callbackUrl,
          multiOutputResponse(chunks, premiumQuickReplies(freeUnlocks > 0)),
        );
      } else {
        const formatted = telegramToPlainText(result);
        const chunks = splitForKakao(formatted);
        await sendCallbackResponse(
          callbackUrl,
          multiOutputResponse(chunks, afterProfileQuickReplies()),
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[kakao-handler] compatibility callback error:', msg);
      await sendCallbackResponse(
        callbackUrl,
        errorResponse(`궁합 분석 중 오류가 발생했어요: ${msg}`),
      ).catch(() => {});
    }
  })();
}

// ==========================================
// 오늘의 운세
// ==========================================

async function handleDailyFortune(userId: string): Promise<KakaoSkillResponse> {
  const profile = await getProfile(PLATFORM, userId);
  if (!profile) {
    return simpleTextResponse(
      '오늘의 운세를 보려면 프로필 등록이 필요해요!\n\n예: 1994년 10월 3일 오후 7시 30분 여성',
    );
  }

  try {
    const birthProfile = {
      year: String(profile.birth_year),
      month: String(profile.birth_month),
      day: String(profile.birth_day),
      hour: String(profile.birth_hour),
      minute: String(profile.birth_minute),
      gender: profile.gender as '남성' | '여성',
    };
    const saju = await calculateSajuFromAPI(birthProfile);
    const result = await generateDailyFortune(PLATFORM, userId, saju.day[0], saju.fullString);

    const formatted = telegramToPlainText(result.freeSection);
    const chunks = splitForKakao(formatted);

    return multiOutputResponse(chunks, [
      quickReply('시간대별 상세', '__unlock_premium__'),
      quickReply('택일 분석', '이번주에 좋은 날 알려줘'),
      quickReply('질문하기', '올해 운세 알려줘'),
    ]);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '오류';
    return errorResponse(`운세 생성 중 오류: ${msg}`);
  }
}

// ==========================================
// 택일 분석
// ==========================================

async function handleAuspiciousDayQuestion(
  userId: string,
  profile: UserProfile,
  eventType: EventType,
  utterance: string,
): Promise<{ response: KakaoSkillResponse | null; needsCallback: boolean }> {
  try {
    const birthProfile = {
      year: String(profile.birth_year),
      month: String(profile.birth_month),
      day: String(profile.birth_day),
      hour: String(profile.birth_hour),
      minute: String(profile.birth_minute),
      gender: profile.gender as '남성' | '여성',
    };
    const saju = await calculateSajuFromAPI(birthProfile);
    const results = analyzeAuspiciousDays(saju.day[0], saju.day[1], eventType, 14);
    const formatted = telegramToPlainText(formatAuspiciousDays(results, eventType));
    const chunks = splitForKakao(formatted);

    await addDbTurn(PLATFORM, userId, 'user', utterance);
    await addDbTurn(PLATFORM, userId, 'assistant', formatted);

    return {
      response: multiOutputResponse(chunks, afterProfileQuickReplies()),
      needsCallback: false,
    };
  } catch {
    return {
      response: errorResponse('택일 분석 중 오류가 발생했어요.'),
      needsCallback: false,
    };
  }
}

// ==========================================
// 크레딧/구독 안내
// ==========================================

async function handleCreditsInfo(userId: string): Promise<KakaoSkillResponse> {
  const credits = await getUserCredits(PLATFORM, userId);
  const tier = await getUserTier(PLATFORM, userId);

  let statusMsg = `현재 크레딧: ${credits}개\n`;
  if (tier === 'premium') statusMsg += '구독: 프리미엄 (무제한)\n';
  else if (tier === 'basic') statusMsg += '구독: 베이직\n';
  else statusMsg += '구독: 없음\n';

  return textCardResponse(
    statusMsg + '\n💎 크레딧 충전\n' +
    '• 10개: 9,900원\n' +
    '• 30개: 24,900원 (17% 할인)\n\n' +
    '💎 월간 구독\n' +
    '• 베이직: 9,900원/월 (하루 10회)\n' +
    '• 프리미엄: 19,900원/월 (무제한)',
    undefined,
    [
      quickReply('10크레딧 충전', '__buy_credit_10__'),
      quickReply('베이직 구독', '__buy_monthly_basic__'),
      quickReply('프리미엄 구독', '__buy_monthly_premium__'),
    ],
    '💎 크레딧 & 구독',
  );
}

// ==========================================
// Sync 대안 (callback 없는 경우, 타임아웃 가능성 있음)
// ==========================================

async function handleGeneralSync(
  userId: string,
  utterance: string,
  profile: UserProfile,
): Promise<{ response: KakaoSkillResponse | null; needsCallback: boolean }> {
  try {
    const storedBirthProfile = {
      year: String(profile.birth_year),
      month: String(profile.birth_month),
      day: String(profile.birth_day),
      hour: String(profile.birth_hour),
      minute: String(profile.birth_minute),
      gender: profile.gender as '남성' | '여성',
    };

    const dbHistory = await getDbHistory(PLATFORM, userId);
    const history = dbHistory.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
      timestamp: Date.now(),
    }));
    await addDbTurn(PLATFORM, userId, 'user', utterance);

    trackInterest(PLATFORM, userId, utterance).catch(() => {});

    const TIMEOUT_MS = 4200;
    const reply = await Promise.race([
      generateReply(utterance, history, storedBirthProfile),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS),
      ),
    ]);

    await addDbTurn(PLATFORM, userId, 'assistant', reply);

    const parsed = parseAndFormatFreemium(reply, utterance);
    if (parsed.hasPremium) {
      const freeUnlocks = await getFreeUnlocks(PLATFORM, userId);
      const chunks = splitForKakao(parsed.displayText);
      return {
        response: multiOutputResponse(chunks, premiumQuickReplies(freeUnlocks > 0)),
        needsCallback: false,
      };
    }

    const formatted = telegramToPlainText(reply);
    const chunks = splitForKakao(formatted);
    return {
      response: multiOutputResponse(chunks, afterProfileQuickReplies()),
      needsCallback: false,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'TIMEOUT') {
      return {
        response: simpleTextResponse(
          '분석에 시간이 조금 더 필요해요.\n잠시 후 다시 같은 질문을 보내주세요!',
          afterProfileQuickReplies(),
        ),
        needsCallback: false,
      };
    }
    const msg = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      response: errorResponse(`분석 중 오류가 발생했어요: ${msg}`),
      needsCallback: false,
    };
  }
}

async function handleWealthSync(
  userId: string,
  utterance: string,
  profile: UserProfile,
): Promise<{ response: KakaoSkillResponse | null; needsCallback: boolean }> {
  // 재물운은 거의 항상 5초 초과 → 타임아웃 응답
  return {
    response: simpleTextResponse(
      '재물운 분석은 시간이 조금 걸려요.\n잠시 후 다시 질문해주세요!',
      afterProfileQuickReplies(),
    ),
    needsCallback: false,
  };
}

async function handleCompatibilitySync(
  userId: string,
  profile: UserProfile,
  partnerParsed: { year: string; month: string; day: string; hour: string; minute: string; gender: '남성' | '여성' },
  question: string,
): Promise<{ response: KakaoSkillResponse | null; needsCallback: boolean }> {
  // 궁합도 거의 항상 5초 초과
  return {
    response: simpleTextResponse(
      '궁합 분석은 시간이 조금 걸려요.\n잠시 후 다시 질문해주세요!',
      afterProfileQuickReplies(),
    ),
    needsCallback: false,
  };
}
