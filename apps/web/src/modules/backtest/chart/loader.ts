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

/** Bars per lazy-load request (spec §2.2: windows, never the whole year). */
export const BARS_PAGE = 500;

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

/** Candle pages kept in memory, newest use last. Enough for both instruments × three timeframes × paging. */
const CACHE_SIZE = 80;
/** A page whose `until` is this close to now may still gain a forming bar, so it is kept only briefly. */
const RECENT_MS = 10 * 60_000;
const RECENT_TTL_MS = 30_000;

type Cached = { page: Promise<BarsPage>; at: number; recent: boolean };
const cache = new Map<string, Cached>();

/** Live charts ask "until now": rounding to the minute lets repeated loads share one cached page. */
export function liveUntil(now: number): Date {
  return new Date(Math.floor(now / 60_000) * 60_000);
}

/**
 * Candle page, cached by request. History doesn't change, so switching instrument or timeframe back and forth
 * (or a prefetch) reuses a page instead of downloading it again; pages near "now" expire after 30 s. Two
 * requests for the same page share one fetch. A failed fetch is not kept.
 */
export function fetchBars(params: BarsParams, signal: AbortSignal | null = null, now = Date.now()): Promise<BarsPage> {
  const url = barsUrl(params);
  const hit = cache.get(url);
  if (hit && (!hit.recent || now - hit.at < RECENT_TTL_MS)) {
    cache.delete(url);
    cache.set(url, hit);
    return hit.page;
  }
  const page = getJson<BarsPage>(url, signal);
  cache.set(url, { page, at: now, recent: params.until.getTime() > now - RECENT_MS });
  page.catch(() => {
    if (cache.get(url)?.page === page) cache.delete(url);
  });
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return page;
}

/** Warms the cache for a page the user is likely to open next (another timeframe or instrument). */
export function prefetchBars(params: BarsParams): void {
  void fetchBars(params).catch(() => undefined);
}

/** Uncached page, for replay steps: each is asked once, and caching them would push out the pages worth keeping. */
export function fetchBarsFresh(params: BarsParams, signal: AbortSignal | null = null): Promise<BarsPage> {
  return getJson<BarsPage>(barsUrl(params), signal);
}

/** Test hook: forget every cached page. */
export function clearBarsCache(): void {
  cache.clear();
}

/** A request with no answer by then has stalled (a dropped connection): it fails instead of loading forever. */
export const REQUEST_TIMEOUT_MS = 15_000;

export const TIMEOUT_MESSAGE = 'The candles took too long to load. Check your connection and retry.';
export const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and retry.';

/**
 * GET an `{ ok, data }` route. Fails with a plain message on a timeout, a network error or a reply that isn't
 * the route's JSON (a gateway error page), so the chart can say what happened and offer Retry. An abort by the
 * caller's own signal is passed through as is.
 */
export async function getJson<T>(
  url: string,
  signal: AbortSignal | null = null,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  let body: { ok: true; data: T } | { ok: false; error: string };
  try {
    response = await fetch(url, { signal: both, cache: 'no-store' });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(timeout.aborted ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE);
  }
  try {
    body = (await response.json()) as typeof body;
  } catch (e) {
    if (signal?.aborted) throw e;
    if (timeout.aborted) throw new Error(TIMEOUT_MESSAGE);
    throw new Error(`The server answered ${response.status} instead of candles. Retry, or reload the page.`);
  }
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
  const data = await getJson<{ ts: string | null }>(`/api/backtest/candles/next?${q}`);
  return data.ts ? Date.parse(data.ts) : null;
}
