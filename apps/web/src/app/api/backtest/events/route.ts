import { type NextRequest, NextResponse } from 'next/server';
import { parseEventsQuery } from '@/modules/backtest/lib/bars-query';
import { getChartEvents } from '@/modules/backtest/server/chart';

/** News markers for the chart: the schedule may run ahead of the cursor, actuals never do (news spec §4). */
export async function GET(request: NextRequest) {
  const query = parseEventsQuery(request.nextUrl.searchParams);
  if (!query.success) {
    return NextResponse.json({ ok: false, error: query.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  }
  const result = await getChartEvents(query.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
