import { type NextRequest, NextResponse } from 'next/server';
import { parseNextQuery } from '@/modules/backtest/lib/bars-query';
import { getNextMinute } from '@/modules/backtest/server/chart';

/** Replay over a closed market: when the next candle exists. Returns a time only, never prices. */
export async function GET(request: NextRequest) {
  const query = parseNextQuery(request.nextUrl.searchParams);
  if (!query.success) {
    return NextResponse.json({ ok: false, error: query.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  }
  const result = await getNextMinute(query.data.instrument, query.data.after);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
