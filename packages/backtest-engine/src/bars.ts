/**
 * Bars for the replay chart (backtester spec §1.2, §3.2). 1m bars are the only stored timeframe; 5m and 15m
 * are built here, in UTC-aligned buckets (:00, :05, … / :00, :15, …). Prices are numbers on the chart side:
 * they come from numeric(18,5) columns and round-trip exactly; P/L uses decimal.js (M20).
 */
export type Bar = { ts: number; open: number; high: number; low: number; close: number; volume: number };

export const TIMEFRAMES = [1, 5, 15] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const MINUTE_MS = 60_000;

export function parseTimeframe(value: unknown): Timeframe | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return TIMEFRAMES.find((tf) => tf === n) ?? null;
}

/** Open time of the bucket containing `ts`. */
export function bucketStart(ts: number, tf: Timeframe): number {
  const size = tf * MINUTE_MS;
  return ts - (((ts % size) + size) % size);
}

/**
 * Aggregates ascending 1m bars into `tf` bars. A bucket only contains the 1m bars it was given, so a bucket
 * whose later minutes are not in the input (the replay cursor is inside it) comes out as the forming bar.
 */
export function aggregate(bars: Bar[], tf: Timeframe): Bar[] {
  if (tf === 1) return bars.map((b) => ({ ...b }));
  const out: Bar[] = [];
  let current: Bar | null = null;
  for (const bar of bars) {
    const start = bucketStart(bar.ts, tf);
    if (current && current.ts === start) {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    } else {
      current = { ts: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
      out.push(current);
    }
  }
  return out;
}

/** True when the `tf` bar opening at `start` has all its minutes at or before `cursor` (a 1m open time). */
export function isBarComplete(start: number, tf: Timeframe, cursor: number): boolean {
  return start + (tf - 1) * MINUTE_MS <= cursor;
}

/** Drops every 1m bar after the cursor — the no-lookahead filter (spec §3.2). */
export function visibleUntil(bars: Bar[], cursor: number): Bar[] {
  return bars.filter((b) => b.ts <= cursor);
}
