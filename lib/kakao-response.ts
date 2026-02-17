import type { KakaoSkillResponse } from './kakao-types';

export function simpleTextResponse(text: string): KakaoSkillResponse {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
}

export function errorResponse(
  message = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
): KakaoSkillResponse {
  return simpleTextResponse(message);
}
