import Decimal from 'decimal.js';

/** One 1-minute bid candle; prices as decimal strings (CLAUDE.md rule 5 applies to prices too). */
export type Candle = { ts: Date; open: string; high: string; low: string; close: string; volume: string | null };

export type RawCandle = { timestamp: number; open: number; high: number; low: number; close: number; volume?: number };

/**
 * Converts a provider row into a stored candle, or explains why it can't be stored. Rows outside [from, to),
 * not on a minute boundary, non-finite, or with an impossible OHLC are rejected rather than stored.
 */
export function toCandle(raw: RawCandle, from: Date, to: Date): Candle | string {
  const { timestamp } = raw;
  if (!Number.isFinite(timestamp) || timestamp % 60_000 !== 0) return `bad timestamp ${timestamp}`;
  if (timestamp < from.getTime() || timestamp >= to.getTime())
    return `outside range ${new Date(timestamp).toISOString()}`;
  const prices = [raw.open, raw.high, raw.low, raw.close];
  if (!prices.every((p) => Number.isFinite(p) && p > 0)) return `bad price at ${new Date(timestamp).toISOString()}`;
  const [open, high, low, close] = prices.map((p) => new Decimal(p).toDecimalPlaces(5)) as [
    Decimal,
    Decimal,
    Decimal,
    Decimal,
  ];
  if (high.lt(Decimal.max(open, close, low)) || low.gt(Decimal.min(open, close))) {
    return `impossible OHLC at ${new Date(timestamp).toISOString()}`;
  }
  const volume = raw.volume !== undefined && Number.isFinite(raw.volume) && raw.volume >= 0 ? raw.volume : null;
  return {
    ts: new Date(timestamp),
    open: open.toString(),
    high: high.toString(),
    low: low.toString(),
    close: close.toString(),
    volume: volume === null ? null : new Decimal(volume).toDecimalPlaces(4).toString(),
  };
}

/** Validates a batch; candles sorted by time, one per minute (the later row wins on a duplicate). */
export function normaliseCandles(rows: RawCandle[], from: Date, to: Date): { candles: Candle[]; rejected: string[] } {
  const byTs = new Map<number, Candle>();
  const rejected: string[] = [];
  for (const row of rows) {
    const result = toCandle(row, from, to);
    if (typeof result === 'string') rejected.push(result);
    else byTs.set(result.ts.getTime(), result);
  }
  return { candles: [...byTs.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime()), rejected };
}
