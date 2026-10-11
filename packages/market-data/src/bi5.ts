import type { RawCandle } from './candles';

/**
 * A Dukascopy minute-candle record: uint32 seconds since the day's UTC midnight, then open, close, low, high as
 * uint32 (price × scale), then float32 volume. Big-endian, 24 bytes.
 */
const RECORD_BYTES = 24;
const DAY_SECONDS = 86_400;

/**
 * Decodes a decompressed `BID_candles_min_1.bi5` day file into 1m candles. `scale` turns the integer prices into
 * real ones. Throws on a truncated file or a time past the day, so a format change fails loudly instead of storing
 * wrong candles. Flat minutes (no trades: volume 0 and O=H=L=C) are skipped, like `ignoreFlats` on the old feed.
 */
export function parseMinuteCandles(data: Uint8Array, dayStartMs: number, scale: number): RawCandle[] {
  if (data.byteLength % RECORD_BYTES !== 0) {
    throw new Error(`Candle file is ${data.byteLength} bytes, not a multiple of ${RECORD_BYTES}.`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const candles: RawCandle[] = [];
  for (let at = 0; at < data.byteLength; at += RECORD_BYTES) {
    const seconds = view.getUint32(at);
    if (seconds >= DAY_SECONDS) throw new Error(`Candle time ${seconds} s is past the end of the day.`);
    const open = view.getUint32(at + 4) / scale;
    const close = view.getUint32(at + 8) / scale;
    const low = view.getUint32(at + 12) / scale;
    const high = view.getUint32(at + 16) / scale;
    const volume = view.getFloat32(at + 20);
    if (volume === 0 && open === close && open === low && open === high) continue;
    candles.push({ timestamp: dayStartMs + seconds * 1000, open, high, low, close, volume });
  }
  return candles;
}
