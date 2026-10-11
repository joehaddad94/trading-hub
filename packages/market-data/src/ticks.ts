import type { RawCandle } from './candles';

/** One Dukascopy tick. Prices are already scaled to real prices; `ms` is epoch milliseconds. */
export type Tick = { ms: number; ask: number; bid: number; askVolume: number; bidVolume: number };

/** A .bi5 tick record: uint32 ms offset, uint32 ask, uint32 bid (price × scale), float32 ask/bid volume. Big-endian. */
const RECORD_BYTES = 20;
const DAY_MS = 86_400_000;

/**
 * Decodes a decompressed day file of ticks. `baseMs` is the UTC midnight the offsets count from; `scale` turns
 * the integer prices into real ones (e.g. 1000 → 3 decimals). Throws on a truncated file or an offset past the
 * day, so a format change fails loudly instead of storing wrong candles.
 */
export function parseTicks(data: Uint8Array, baseMs: number, scale: number): Tick[] {
  if (data.byteLength % RECORD_BYTES !== 0) {
    throw new Error(`Tick file is ${data.byteLength} bytes, not a multiple of ${RECORD_BYTES}.`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ticks: Tick[] = [];
  for (let at = 0; at < data.byteLength; at += RECORD_BYTES) {
    const offset = view.getUint32(at);
    if (offset >= DAY_MS) throw new Error(`Tick offset ${offset} ms is past the end of the day.`);
    ticks.push({
      ms: baseMs + offset,
      ask: view.getUint32(at + 4) / scale,
      bid: view.getUint32(at + 8) / scale,
      askVolume: view.getFloat32(at + 12),
      bidVolume: view.getFloat32(at + 16),
    });
  }
  return ticks;
}

/** Bid ticks → 1-minute bid candles (minutes without ticks are skipped, like `ignoreFlats`). Volume = Σ bid volume. */
export function ticksToMinuteCandles(ticks: Tick[]): RawCandle[] {
  const candles: RawCandle[] = [];
  let current: RawCandle | null = null;
  for (const t of [...ticks].sort((a, b) => a.ms - b.ms)) {
    const minute = t.ms - (t.ms % 60_000);
    if (!current || current.timestamp !== minute) {
      if (current) candles.push(current);
      current = { timestamp: minute, open: t.bid, high: t.bid, low: t.bid, close: t.bid, volume: 0 };
    }
    current.high = Math.max(current.high, t.bid);
    current.low = Math.min(current.low, t.bid);
    current.close = t.bid;
    current.volume = (current.volume ?? 0) + t.bidVolume;
  }
  if (current) candles.push(current);
  return candles;
}
