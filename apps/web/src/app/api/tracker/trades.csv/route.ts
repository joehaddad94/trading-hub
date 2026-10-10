import { parseScope } from '@trading/core';
import { resolveScope } from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';
import { getTradesCsv } from '@/modules/tracker/server/trades';
import { parseTradeParams } from '@/modules/tracker/trade-params';

/** CSV export of the Trades screen's filtered view (§8.3 screen 5). Signed-in only (the proxy guards /api). */
export async function GET(request: Request) {
  const db = getDb();
  if (!db) return new Response('Database not configured.', { status: 503 });
  const url = new URL(request.url);
  const params = parseTradeParams(Object.fromEntries(url.searchParams));
  const scope = await resolveScope(db, parseScope(url.searchParams.get('scope')));
  const csv = await getTradesCsv(scope, params);
  if (csv === null) return new Response('Database not configured.', { status: 503 });
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="trades-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
