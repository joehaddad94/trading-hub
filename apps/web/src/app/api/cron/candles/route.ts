import * as Sentry from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { runCandleJob } from '@/modules/backtest/server/market-data';

export const maxDuration = 60;

/** Daily Vercel cron (vercel.json): yesterday's 1m candles → upsert → gap check → alerts. Idempotent. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const run = await runCandleJob();
  if (!run.ok) {
    Sentry.captureMessage(`cron/candles failed: ${run.error ?? `provider failure for ${run.day}`}`, 'error');
    return NextResponse.json(run, { status: 500 });
  }
  return NextResponse.json(run);
}
