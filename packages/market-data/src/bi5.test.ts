import { describe, expect, it } from 'vitest';
import { parseMinuteCandles } from './bi5';

const DAY = Date.UTC(2026, 0, 5);

export function candleRecord(seconds: number, o: number, c: number, l: number, h: number, v: number): Uint8Array {
  const view = new DataView(new ArrayBuffer(24));
  [seconds, o, c, l, h].forEach((n, i) => {
    view.setUint32(i * 4, n);
  });
  view.setFloat32(20, v);
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

describe('parseMinuteCandles', () => {
  it('decodes open, close, low, high in that order against the day start and scale', () => {
    const rows = parseMinuteCandles(
      concat(
        candleRecord(0, 42_000_500, 42_002_000, 41_999_000, 42_003_250, 1.5),
        candleRecord(60, 42_001_000, 42_001_000, 42_001_000, 42_001_000, 0), // flat: skipped
        candleRecord(120, 42_002_000, 42_001_000, 42_000_000, 42_004_000, 2),
      ),
      DAY,
      1000,
    );
    expect(rows).toEqual([
      { timestamp: DAY, open: 42_000.5, high: 42_003.25, low: 41_999, close: 42_002, volume: 1.5 },
      { timestamp: DAY + 120_000, open: 42_002, high: 42_004, low: 42_000, close: 42_001, volume: 2 },
    ]);
  });

  it('rejects a truncated file and a time past the day', () => {
    expect(() => parseMinuteCandles(new Uint8Array(23), DAY, 1000)).toThrow(/multiple of 24/);
    expect(() => parseMinuteCandles(candleRecord(86_400, 1, 1, 1, 1, 1), DAY, 1000)).toThrow(/past the end/);
  });
});
