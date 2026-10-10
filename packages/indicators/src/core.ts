/** One candle as indicators see it. Prices are chart numbers (display only, never money). */
export type Ohlc = { open: number; high: number; low: number; close: number };

/** `null` until an indicator has enough bars, like TradingView's `na`. */
export type Series = (number | null)[];

/**
 * Wilder's moving average, TradingView's `ta.rma`: seeded with the simple average of the first `length`
 * values, then `(prev * (length - 1) + x) / length`. `null` inputs before the first value are skipped.
 */
export function rma(values: Series, length: number): Series {
  assertLength(length);
  const out: Series = [];
  let prev: number | null = null;
  let seed = 0;
  let count = 0;
  for (const x of values) {
    if (x === null) {
      out.push(prev === null ? null : prev);
      continue;
    }
    if (prev === null) {
      seed += x;
      count += 1;
      if (count === length) prev = seed / length;
      out.push(prev);
      continue;
    }
    prev = (prev * (length - 1) + x) / length;
    out.push(prev);
  }
  return out;
}

/** True range, TradingView's `ta.tr(true)`: the first bar uses high − low. */
export function trueRange(bars: Ohlc[]): number[] {
  return bars.map((b, i) => {
    const prev = bars[i - 1];
    if (!prev) return b.high - b.low;
    return Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
  });
}

export function assertLength(length: number) {
  if (!Number.isInteger(length) || length < 1) throw new RangeError(`length must be a positive integer, got ${length}`);
}
