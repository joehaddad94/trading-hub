import { type NextRequest, NextResponse } from 'next/server';
import { parseBarsQuery } from '@/modules/backtest/lib/bars-query';
import { getBars } from '@/modules/backtest/server/chart';

/** Candles for the Backtest Lab chart and replay. Requires `until`; never returns a bar after it (spec §3.2). */
export async function GET(request: NextRequest) {
  const query = parseBarsQuery(request.nextUrl.searchParams);
  if (!query.success) {
    return NextResponse.json({ ok: false, error: query.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  }
  const started = performance.now();
  const result = await getBars(query.data);
  // DevTools › Network › Timing shows how much of a replay step is the database vs the network.
  const db = `db;dur=${(performance.now() - started).toFixed(1)}`;
  return NextResponse.json(result, {
    status: result.ok ? 200 : result.error === 'Unknown instrument.' ? 404 : 500,
    headers: { 'Server-Timing': db },
  });
}
