import { NextRequest, NextResponse } from 'next/server';
import type { KakaoSkillRequest } from '@/lib/kakao-types';
import { buildCallbackAck } from '@/lib/kakao-callback';
import { errorResponse } from '@/lib/kakao-response-builder';
import { handleKakaoMessage } from '@/lib/kakao-handler';

const SKILL_SECRET = process.env.KAKAO_SKILL_SECRET ?? '';
const ALLOW_METHODS = 'POST, OPTIONS, HEAD';

// Vercel 함수 최대 실행 시간 (초) — callback 비동기 처리를 위해 60초
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

export async function POST(req: NextRequest) {
  // 1. 인증
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: KakaoSkillRequest = await req.json();

    // 2. 핸들러에 위임
    const { response, needsCallback } = await handleKakaoMessage(body);

    // 3-A. Callback 필요 → useCallback:true 즉시 반환
    //      비동기 처리는 handleKakaoMessage 내부에서 fire-and-forget으로 이미 시작됨
    if (needsCallback) {
      return NextResponse.json(buildCallbackAck(), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    // 3-B. 즉시 응답
    return NextResponse.json(response ?? errorResponse(), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  } catch (err) {
    console.error('[kakao/skill] unhandled error:', err);
    return NextResponse.json(errorResponse(), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }
}
