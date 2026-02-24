import type { KakaoCallbackAck, KakaoSkillResponse } from './kakao-types';

/**
 * Callback API ack 응답 빌더.
 * 카카오에 "비동기로 응답할 것"을 알려주는 즉시 응답.
 */
export function buildCallbackAck(): KakaoCallbackAck {
  return {
    version: '2.0',
    useCallback: true,
  };
}

/**
 * callbackUrl로 분석 결과를 POST한다.
 * - callbackUrl은 1회용이며 1분 내 사용해야 한다.
 * - 실패 시 재시도 불가 (1회용 URL).
 */
export async function sendCallbackResponse(
  callbackUrl: string,
  response: KakaoSkillResponse,
): Promise<void> {
  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(no body)');
      console.error(
        `[kakao-callback] POST failed: ${res.status} ${res.statusText}`,
        body,
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[kakao-callback] POST error: ${message}`);
  }
}
