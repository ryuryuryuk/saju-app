import { NextRequest, NextResponse } from 'next/server';
import { sendDailyMessagesToAll, sendDailyMessageToOne } from '@/lib/daily_message_sender';

// Vercel Cron 최대 실행 시간 (초)
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET ?? '';

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron은 Authorization 헤더로 CRON_SECRET을 전송
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  // 또는 쿼리 파라미터로 검증 (개발/테스트용)
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret === CRON_SECRET) return true;

  return !CRON_SECRET; // CRON_SECRET 미설정시 통과 (개발 환경)
}

/**
 * GET /api/cron/daily-message
 * Vercel Cron 또는 외부 스케줄러에서 호출.
 *
 * Query params:
 * - secret: CRON_SECRET (필수)
 * - userId: 특정 사용자만 발송 (선택, 테스트용)
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('userId');

  try {
    if (userId) {
      // 단일 사용자 테스트 발송
      const result = await sendDailyMessageToOne(Number(userId));
      return NextResponse.json({
        ok: true,
        mode: 'single',
        result,
      });
    }

    // 전체 사용자 발송
    const report = await sendDailyMessagesToAll();

    console.log(
      `[cron/daily-message] Sent ${report.success}/${report.total} messages (${report.failed} failed)`,
    );

    return NextResponse.json({
      ok: true,
      mode: 'all',
      report: {
        total: report.total,
        success: report.success,
        failed: report.failed,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[cron/daily-message] Error:', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
