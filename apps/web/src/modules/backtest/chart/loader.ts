import type { Bar, Timeframe } from '@trading/backtest-engine';

export type BarsParams = {
  instrument: string;
  tf: Timeframe;
  until: Date;
  before?: Date | undefined;
  after?: Date | undefined;
  count?: number | undefined;
};

export type BarsPage = { bars: Bar[]; hasMore: boolean };

export function barsUrl(params: BarsParams): string {
  const q = new URLSearchParams({
    instrument: params.instrument,
    tf: String(params.tf),
    until: params.until.toISOString(),
  });
  if (params.before) q.set('before', params.before.toISOString());
  if (params.after) q.set('after', params.after.toISOString());
  if (params.count) q.set('count', String(params.count));
  return `/api/backtest/candles?${q}`;
}

export async function fetchBars(params: BarsParams, signal: AbortSignal | null = null): Promise<BarsPage> {
  const response = await fetch(barsUrl(params), { signal, cache: 'no-store' });
  const body = (await response.json()) as { ok: true; data: BarsPage } | { ok: false; error: string };
  if (!body.ok) throw new Error(body.error);
  return body.data;
}

/** KLineCharts wants `timestamp`; our bars use `ts`. */
export function toKLine(bar: Bar) {
  return {
    timestamp: bar.ts,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

/** First 1m candle time at or after `after` (replay over a closed market), or null at the end of the data. */
export async function fetchNextMinute(instrument: string, after: Date): Promise<number | null> {
  const q = new URLSearchParams({ instrument, after: after.toISOString() });
  const response = await fetch(`/api/backtest/candles/next?${q}`, { cache: 'no-store' });
  const body = (await response.json()) as { ok: true; data: { ts: string | null } } | { ok: false; error: string };
  if (!body.ok) throw new Error(body.error);
  return body.data.ts ? Date.parse(body.data.ts) : null;
}
