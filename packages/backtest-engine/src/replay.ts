import { type Bar, bucketStart, MINUTE_MS, type Timeframe } from './bars';

/**
 * Replay (backtester spec §3). The cursor is the open time of the newest revealed 1m bar; nothing after it is
 * ever fetched or drawn. Pure: callers pass the cursor and get the next target back.
 */

export const SPEEDS = [1, 2, 5, 10, 20] as const;
export type Speed = (typeof SPEEDS)[number];

export type StepMode = 'bar' | 'minute';

/**
 * Where a step lands. `minute` reveals one more 1m bar; `bar` reveals up to the last minute of the `tf` bar
 * after the cursor, so a forming bar is completed first and each further step adds one whole bar.
 */
export function stepTarget(cursor: number, tf: Timeframe, mode: StepMode): number {
  const next = cursor + MINUTE_MS;
  if (mode === 'minute' || tf === 1) return next;
  return bucketStart(next, tf) + (tf - 1) * MINUTE_MS;
}

/**
 * Applies newly revealed 1m bars (ascending, all after the chart's last minute) to the last `tf` bar:
 * returns the bars to upsert in order — the updated forming bar first, then any new ones.
 */
export function applyMinutes(last: Bar | null, minutes: Bar[], tf: Timeframe): Bar[] {
  const out: Bar[] = [];
  let current: Bar | null = last ? { ...last } : null;
  for (const m of minutes) {
    const start = bucketStart(m.ts, tf);
    if (current && current.ts === start) {
      current.high = Math.max(current.high, m.high);
      current.low = Math.min(current.low, m.low);
      current.close = m.close;
      current.volume += m.volume;
    } else {
      current = { ts: start, open: m.open, high: m.high, low: m.low, close: m.close, volume: m.volume };
    }
    if (out[out.length - 1] !== current) out.push(current);
  }
  return out;
}

/**
 * Where a step back lands: `minute` hides the newest 1m bar; `bar` hides the forming `tf` bar (or, on a bar's
 * last minute, the whole bar), leaving the cursor on the previous bar's last minute.
 */
export function stepBackTarget(cursor: number, tf: Timeframe, mode: StepMode): number {
  if (mode === 'minute' || tf === 1) return cursor - MINUTE_MS;
  return bucketStart(cursor, tf) - MINUTE_MS;
}

/** Where `count` steps in a row land: lets playback reveal several bars per request when the network lags. */
export function stepTargetBy(cursor: number, tf: Timeframe, mode: StepMode, count: number): number {
  let target = cursor;
  for (let i = 0; i < Math.max(1, Math.floor(count)); i += 1) target = stepTarget(target, tf, mode);
  return target;
}

/**
 * Bars to reveal per playback tick so the average speed holds when a step takes `stepMs` (its request time)
 * at an `intervalMs` tick: 1 while requests are faster than the tick, more as they slow down, at most `max`.
 */
export function barsPerTick(stepMs: number, intervalMs: number, max = 10): number {
  if (stepMs <= intervalMs) return 1;
  return Math.min(max, Math.ceil(stepMs / intervalMs));
}

/** Milliseconds between automatic steps at `speed` bars per second. */
export function playIntervalMs(speed: Speed): number {
  return Math.round(1000 / speed);
}

/** "Start replay here" on a `tf` bar hides everything after that bar: the cursor is its last minute. */
export function cursorForBar(barStart: number, tf: Timeframe): number {
  return bucketStart(barStart, tf) + (tf - 1) * MINUTE_MS;
}
