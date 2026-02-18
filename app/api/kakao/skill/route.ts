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
    const userId = body?.userRequest?.user?.id ?? 'anonymous';

    // 2. 대화 히스토리 로드
    const history = getHistory(userId);

    // 3. 사용자 발화 저장
    addTurn(userId, 'user', utterance);

    // 4. 4.5초 타임아웃으로 답변 생성
    let reply: string;
    try {
      reply = await Promise.race([
        generateReply(utterance, history),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      if (err instanceof Error && err.message === 'TIMEOUT') {
        reply = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
      } else {
        throw err;
      }
    }

    // 5. 어시스턴트 답변 저장
    addTurn(userId, 'assistant', reply);

    // 6. 카카오 포맷으로 반환
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
