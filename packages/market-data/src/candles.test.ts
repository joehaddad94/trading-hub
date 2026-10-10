import { describe, expect, it } from 'vitest';
import { normaliseCandles, toCandle } from './candles';

const from = new Date('2026-10-07T00:00:00Z');
const to = new Date('2026-10-08T00:00:00Z');
const ts = Date.parse('2026-10-07T13:30:00Z');

describe('toCandle', () => {
  it('converts prices to decimal strings without float noise', () => {
    expect(
      toCandle({ timestamp: ts, open: 46012.1, high: 46020.35, low: 46001.2, close: 46019.9, volume: 1.23 }, from, to),
    ).toEqual({
      ts: new Date(ts),
      open: '46012.1',
      high: '46020.35',
      low: '46001.2',
      close: '46019.9',
      volume: '1.23',
    });
  });

  it('rejects bad rows', () => {
    const ok = { timestamp: ts, open: 1, high: 2, low: 0.5, close: 1.5 };
    expect(toCandle({ ...ok, timestamp: ts + 30_000 }, from, to)).toMatch(/bad timestamp/);
    expect(toCandle({ ...ok, timestamp: to.getTime() }, from, to)).toMatch(/outside range/);
    expect(toCandle({ ...ok, open: Number.NaN }, from, to)).toMatch(/bad price/);
    expect(toCandle({ ...ok, high: 1.2 }, from, to)).toMatch(/impossible OHLC/);
    expect(toCandle({ ...ok, low: 1.6 }, from, to)).toMatch(/impossible OHLC/);
    expect(toCandle({ ...ok, volume: -1 }, from, to)).toMatchObject({ volume: null });
  });
});

describe('normaliseCandles', () => {
  it('sorts, dedupes (later row wins) and reports rejects', () => {
    const rows = [
      { timestamp: ts + 60_000, open: 2, high: 3, low: 1, close: 2 },
      { timestamp: ts, open: 1, high: 2, low: 1, close: 1 },
      { timestamp: ts, open: 1, high: 2, low: 1, close: 2 },
      { timestamp: ts, open: 1, high: 0, low: 1, close: 2 },
    ];
    const { candles, rejected } = normaliseCandles(rows, from, to);
    expect(candles.map((c) => [c.ts.toISOString(), c.close])).toEqual([
      ['2026-10-07T13:30:00.000Z', '2'],
      ['2026-10-07T13:31:00.000Z', '2'],
    ]);
    expect(rejected).toHaveLength(1);
  });
});
