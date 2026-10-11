import { describe, expect, it } from 'vitest';
import { parseTicks, ticksToMinuteCandles } from './ticks';

const DAY = Date.UTC(2026, 0, 5);

function record(offset: number, ask: number, bid: number, askVolume = 1, bidVolume = 2): Uint8Array {
  const view = new DataView(new ArrayBuffer(20));
  view.setUint32(0, offset);
  view.setUint32(4, ask);
  view.setUint32(8, bid);
  view.setFloat32(12, askVolume);
  view.setFloat32(16, bidVolume);
  return new Uint8Array(view.buffer);
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe('parseTicks', () => {
  it('decodes big-endian records against the day start and scale', () => {
    const [t] = parseTicks(record(1500, 42_001_250, 42_000_500, 0.5, 1.25), DAY, 1000);
    expect(t).toEqual({ ms: DAY + 1500, ask: 42_001.25, bid: 42_000.5, askVolume: 0.5, bidVolume: 1.25 });
  });

  it('rejects a truncated file and an offset past the day', () => {
    expect(() => parseTicks(new Uint8Array(19), DAY, 1000)).toThrow(/multiple of 20/);
    expect(() => parseTicks(record(86_400_000, 1, 1), DAY, 1000)).toThrow(/past the end/);
  });
});

describe('ticksToMinuteCandles', () => {
  it('builds bid OHLC per minute, skips empty minutes, sums bid volume', () => {
    const ticks = parseTicks(
      concat(
        record(5_000, 0, 100_000),
        record(20_000, 0, 103_000),
        record(40_000, 0, 99_000),
        record(59_999, 0, 101_000),
        record(180_000, 0, 105_000), // minute 3; minutes 1–2 have no ticks
      ),
      DAY,
      1000,
    );
    expect(ticksToMinuteCandles(ticks)).toEqual([
      { timestamp: DAY, open: 100, high: 103, low: 99, close: 101, volume: 8 },
      { timestamp: DAY + 180_000, open: 105, high: 105, low: 105, close: 105, volume: 2 },
    ]);
  });

  it('is empty for no ticks', () => {
    expect(ticksToMinuteCandles([])).toEqual([]);
  });
});
