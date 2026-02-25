import type {
  KakaoSkillResponse,
  KakaoQuickReply,
  KakaoButton,
  KakaoOutput,
} from './kakao-types';

/**
 * simpleText 응답 + 선택적 quickReplies.
 */
export function simpleTextResponse(
  text: string,
  quickReplies?: KakaoQuickReply[],
): KakaoSkillResponse {
  const response: KakaoSkillResponse = {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
  if (quickReplies?.length) {
    response.template.quickReplies = quickReplies;
  }
  return response;
}

/**
 * textCard 응답 + 선택적 quickReplies.
 */
export function textCardResponse(
  description: string,
  buttons?: KakaoButton[],
  quickReplies?: KakaoQuickReply[],
  title?: string,
): KakaoSkillResponse {
  const response: KakaoSkillResponse = {
    version: '2.0',
    template: {
      outputs: [
        {
          textCard: {
            ...(title ? { title } : {}),
            description,
            ...(buttons?.length ? { buttons } : {}),
          },
        },
      ],
    },
  };
  if (quickReplies?.length) {
    response.template.quickReplies = quickReplies;
  }
  return response;
}

/**
 * 여러 simpleText를 최대 3개까지 output으로 보낸다.
 */
export function multiOutputResponse(
  texts: string[],
  quickReplies?: KakaoQuickReply[],
): KakaoSkillResponse {
  const outputs: KakaoOutput[] = texts.slice(0, 3).map((text) => ({
    simpleText: { text },
  }));

  const response: KakaoSkillResponse = {
    version: '2.0',
    template: { outputs },
  };
  if (quickReplies?.length) {
    response.template.quickReplies = quickReplies;
  }
  return response;
}

/**
 * 에러 응답 (카카오 포맷 200 반환).
 */
export function errorResponse(
  message = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
): KakaoSkillResponse {
  return simpleTextResponse(message);
}

// --- QuickReply 헬퍼 ---

/** message 타입 quickReply 생성 */
export function quickReply(label: string, messageText: string): KakaoQuickReply {
  return { label, action: 'message', messageText };
}

/** 기본 메뉴 quickReplies — 오늘의 운세 추가 */
export function defaultQuickReplies(): KakaoQuickReply[] {
  return [
    quickReply('오늘의 운세', '__cmd_daily__'),
    quickReply('사주 분석', '사주 분석해줘'),
    quickReply('궁합 보기', '궁합 분석해줘'),
    quickReply('재물운', '재물운 알려줘'),
  ];
}

/** 프로필 등록 후 quickReplies — 택일 추가 */
export function afterProfileQuickReplies(): KakaoQuickReply[] {
  return [
    quickReply('오늘의 운세', '__cmd_daily__'),
    quickReply('연애운', '올해 연애운 어때?'),
    quickReply('재물운', '이번 달 재물운'),
    quickReply('택일', '이번주에 면접 보기 좋은 날'),
  ];
}

/** 프리미엄 언락 quickReplies — 크레딧 추가 */
export function premiumQuickReplies(hasFreeUnlocks: boolean): KakaoQuickReply[] {
  const replies: KakaoQuickReply[] = [
    quickReply('핵심 답변 열기', '__unlock_premium__'),
  ];
  if (hasFreeUnlocks) {
    replies.push(quickReply('무료 열람권 사용', '__use_free_unlock__'));
  }
  replies.push(quickReply('크레딧 충전', '__cmd_credits__'));
  replies.push(quickReply('다른 질문하기', '다른 질문할게'));
  return replies;
}
