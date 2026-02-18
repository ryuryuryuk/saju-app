import { NextRequest, NextResponse } from 'next/server';
import type { KakaoSkillRequest } from '@/lib/kakao-types';
import { simpleTextResponse, errorResponse } from '@/lib/kakao-response';
import { getHistory, addTurn } from '@/lib/kakao-history';
import { generateReply } from '@/lib/kakao-service';

const SKILL_SECRET = process.env.KAKAO_SKILL_SECRET ?? '';
const TIMEOUT_MS = 4500;
const ALLOW_METHODS = 'POST, OPTIONS, HEAD';

function isAuthorized(req: NextRequest): boolean {
  // secret이 설정되지 않은 경우 통과 (개발 환경)
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
    const utterance = body?.userRequest?.utterance?.trim() ?? '';

    // TODO: 테스트용 즉시 응답 — 실제 분석 로직 복원 필요
    const reply = `분석중입니다. 입력: "${utterance}"`;

    return NextResponse.json(simpleTextResponse(reply),{
      headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
      }
    });
  } catch (err) {
    console.error('[kakao/skill] unhandled error:', err);
    // 에러 시에도 카카오 포맷 200 반환 (오픈빌더 fallback 방지)
    return NextResponse.json(errorResponse());
  }
}
