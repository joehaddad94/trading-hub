import { aggregate, type Bar, bucketStart, type Timeframe } from '@trading/backtest-engine';
import type { Executor } from '@trading/db';
import { and, asc, desc, eq, gte, lt, lte } from '@trading/db/orm';
import { candles1m, instruments } from '@trading/db/schema';

export type BarsRequest = {
  code: string;
  tf: Timeframe;
  /** Replay cursor / "now": the newest 1m bar open time that may be returned (spec §3.2). Required. */
  until: Date;
  /** Paging back: only bars that open before this. */
  before?: Date | undefined;
  /** Paging forward: only bars that open at or after this (a bucket start). Wins over `before`. */
  after?: Date | undefined;
  /** Bars wanted (capped). */
  count?: number | undefined;
};

export type BarsPage = { bars: Bar[]; hasMore: boolean };

export const MAX_BARS = 1500;
const DEFAULT_BARS = 500;

/**
 * Lazy-loading window of `tf` bars (spec §2.2) built from 1m candles, newest last. Never returns a 1m bar
 * after `until`, so the newest bar is the forming bar when the cursor sits inside it. When the window is cut
 * by the row limit the oldest (possibly partial) bucket is dropped; the next page starts at the oldest bar kept.
 */
export async function loadBars(db: Executor, request: BarsRequest): Promise<BarsPage | null> {
  const [instrument] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.code, request.code));
  if (!instrument) return null;
  const count = Math.min(Math.max(request.count ?? DEFAULT_BARS, 1), MAX_BARS);
  const limit = count * request.tf + request.tf;
  const conditions = [eq(candles1m.instrumentId, instrument.id), lte(candles1m.ts, request.until)];
  if (request.after) conditions.push(gte(candles1m.ts, request.after));
  else if (request.before) conditions.push(lt(candles1m.ts, request.before));
  const rows = await db
    .select({
      ts: candles1m.ts,
      open: candles1m.open,
      high: candles1m.high,
      low: candles1m.low,
      close: candles1m.close,
      volume: candles1m.volume,
    })
    .from(candles1m)
    .where(and(...conditions))
    .orderBy(request.after ? asc(candles1m.ts) : desc(candles1m.ts))
    .limit(limit);

  const hasMore = rows.length === limit;
  const ordered = request.after ? rows : rows.reverse();
  let minutes: Bar[] = ordered.map((r) => ({
    ts: r.ts.getTime(),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: r.volume === null ? 0 : Number(r.volume),
  }));
  if (hasMore && minutes.length > 0) {
    // The bucket at the cut edge may be partial: drop it, the next page starts there.
    const edge = bucketStart((request.after ? (minutes.at(-1) as Bar) : (minutes[0] as Bar)).ts, request.tf);
    minutes = minutes.filter((m) => bucketStart(m.ts, request.tf) !== edge);
  }
  const bars = aggregate(minutes, request.tf);
  const more = hasMore || bars.length > count;
  return { bars: request.after ? bars.slice(0, count) : bars.slice(-count), hasMore: more };
}
