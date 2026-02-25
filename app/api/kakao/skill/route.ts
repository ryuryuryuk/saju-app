import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import type { KakaoSkillRequest } from '@/lib/kakao-types';
import { buildCallbackAck } from '@/lib/kakao-callback';
import { errorResponse } from '@/lib/kakao-response-builder';
import { handleKakaoMessage } from '@/lib/kakao-handler';

const SKILL_SECRET = process.env.KAKAO_SKILL_SECRET ?? '';
const ALLOW_METHODS = 'POST, OPTIONS, HEAD';

// Vercel 함수 최대 실행 시간 (초) — 백그라운드 분석 처리를 위해 60초
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  if (!SKILL_SECRET) return true;

  const headerSecret = req.headers.get('x-skill-secret');
  const querySecret = req.nextUrl.searchParams.get('secret');
  return headerSecret === SKILL_SECRET || querySecret === SKILL_SECRET;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: ALLOW_METHODS,
      'Access-Control-Allow-Methods': ALLOW_METHODS,
      'Access-Control-Allow-Headers': 'Content-Type, x-skill-secret, Authorization',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      Allow: ALLOW_METHODS,
      'Access-Control-Allow-Methods': ALLOW_METHODS,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
};

export async function POST(req: NextRequest) {
  // 1. 인증
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: KakaoSkillRequest = await req.json();

    // 2. 핸들러에 위임
    const { response, needsCallback, backgroundTask } = await handleKakaoMessage(body);

    // 3. 백그라운드 작업이 있으면 after()로 등록
    //    after()는 응답 반환 후에도 Vercel 함수가 살아있는 동안 실행됨.
    if (backgroundTask) {
      after(async () => {
        try {
          await backgroundTask();
        } catch (err) {
          console.error('[kakao/skill] background task error:', err);
        }
      });
    }

    // 4-A. Callback 필요 → useCallback:true 즉시 반환
    if (needsCallback) {
      return NextResponse.json(buildCallbackAck(), { headers: CORS_HEADERS });
    }

    // 4-B. 즉시 응답
    return NextResponse.json(response ?? errorResponse(), { headers: CORS_HEADERS });
  } catch (err) {
    console.error('[kakao/skill] unhandled error:', err);
    return NextResponse.json(errorResponse(), { headers: CORS_HEADERS });
  }
}
