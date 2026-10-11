import type { RawCandle } from './candles';

/** Dukascopy stores index prices as integers × 1000 (checked against FundedNext fills: NDX ≈ 30,778 on 9 Oct 2026). */
export const BI5_PRICE_SCALE = 1000;
const RECORD_BYTES = 24;

/**
 * Object key of one UTC day of 1-minute bid candles in Dukascopy's S3 bucket, e.g.
 * `USA30IDXUSD/2026/09/08/BID_candles_min_1.bi5` for 8 Oct 2026 (months are 0-based, like the old datafeed).
 */
export function bi5DayKey(providerCode: string, dayStart: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${providerCode.toUpperCase()}/${dayStart.getUTCFullYear()}/${pad(dayStart.getUTCMonth())}/${pad(dayStart.getUTCDate())}/BID_candles_min_1.bi5`;
}

/**
 * Parses an LZMA-decompressed .bi5 minute-candle file: 24-byte big-endian records of
 * [seconds since day start, open, close, low, high (uint32, price × scale), volume (float32)].
 * Flat minutes (no ticks, volume 0) are dropped, as the old provider did, so a missing minute means no trading.
 */
export function parseBi5MinuteCandles(raw: Uint8Array, dayStartMs: number, scale = BI5_PRICE_SCALE): RawCandle[] {
  if (raw.length % RECORD_BYTES !== 0)
    throw new Error(`Corrupt .bi5 file: ${raw.length} bytes is not a whole number of records`);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const rows: RawCandle[] = [];
  for (let at = 0; at < raw.length; at += RECORD_BYTES) {
    const volume = view.getFloat32(at + 20);
    if (volume === 0) continue;
    rows.push({
      timestamp: dayStartMs + view.getUint32(at) * 1000,
      open: view.getUint32(at + 4) / scale,
      close: view.getUint32(at + 8) / scale,
      low: view.getUint32(at + 12) / scale,
      high: view.getUint32(at + 16) / scale,
      volume,
    });
  }
  return rows;
}
