import { describe, expect, it } from 'vitest';
import { atr } from './atr';
import { type Ohlc, rma, trueRange } from './core';
import { INDICATOR_BY_ID, INDICATORS, normaliseSettings } from './registry';
import { rsi } from './rsi';

/** Wilder's RSI worked example (14 periods) as published by StockCharts' "RSI" ChartSchool page. */
const WILDER_CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03,
  46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
];
/** Their table rounds the running averages to 2 dp at every step, so it drifts up to ~0.07 from exact maths. */
const STOCKCHARTS_RSI = [
  70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.3,
  33.08, 37.77,
];

describe('rma', () => {
  it('seeds with the simple average, then smooths', () => {
    expect(rma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, (2 * 2 + 4) / 3, (((2 * 2 + 4) / 3) * 2 + 5) / 3]);
  });
  it('skips leading nulls', () => {
    expect(rma([null, 3, 5], 2)).toEqual([null, null, 4]);
  });
  it('rejects a bad length', () => {
    expect(() => rma([1], 0)).toThrow(RangeError);
    expect(() => rma([1], 1.5)).toThrow(RangeError);
  });
});

describe('rsi', () => {
  it("matches Wilder's worked example", () => {
    const out = rsi(WILDER_CLOSES);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    const values = out.slice(14) as number[];
    expect(values).toHaveLength(STOCKCHARTS_RSI.length);
    values.forEach((v, i) => {
      expect(Math.abs(v - (STOCKCHARTS_RSI[i] as number))).toBeLessThan(0.1);
    });
  });

  it('first value is the exact Wilder RSI of the first 14 changes', () => {
    const changes = WILDER_CLOSES.slice(1, 15).map((c, i) => c - (WILDER_CLOSES[i] as number));
    const gain = changes.reduce((s, c) => s + Math.max(c, 0), 0) / 14;
    const loss = changes.reduce((s, c) => s + Math.max(-c, 0), 0) / 14;
    expect(rsi(WILDER_CLOSES)[14]).toBeCloseTo(100 - 100 / (1 + gain / loss), 10);
    expect(rsi(WILDER_CLOSES)[14]).toBeCloseTo(70.46, 2);
  });

  it('is 100 with only gains and 0 with only losses', () => {
    expect(rsi([1, 2, 3, 4], { length: 2 }).at(-1)).toBe(100);
    expect(rsi([4, 3, 2, 1], { length: 2 }).at(-1)).toBe(0);
  });
});

describe('atr', () => {
  const bars: Ohlc[] = [
    { open: 10, high: 12, low: 9, close: 11 },
    { open: 11, high: 13, low: 10.5, close: 12.5 },
    { open: 12.5, high: 12.8, low: 11, close: 11.2 },
    { open: 13, high: 15, low: 12.9, close: 14 },
    { open: 14, high: 14.5, low: 13.5, close: 14 },
  ];

  it('uses the full true range (gaps count)', () => {
    // bar 3 gaps up from 11.2: |15 − 11.2| = 3.8 beats high − low = 2.1.
    trueRange(bars).forEach((v, i) => {
      expect(v).toBeCloseTo([3, 2.5, 1.8, 3.8, 1][i] as number, 12);
    });
  });

  it("is Wilder's RMA of the true range", () => {
    const tr = [3, 2.5, 1.8, 3.8, 1];
    const seed = (3 + 2.5 + 1.8) / 3;
    const next = (seed * 2 + 3.8) / 3;
    const out = atr(bars, { length: 3 });
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(seed, 12);
    expect(out[3]).toBeCloseTo(next, 12);
    expect(out[4]).toBeCloseTo((next * 2 + (tr[4] as number)) / 3, 12);
  });

  it('defaults to length 14', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ open: i, high: i + 2, low: i, close: i + 1 }));
    const out = atr(many);
    expect(out[12]).toBeNull();
    expect(out[13]).toBeCloseTo((2 + 2 * 13) / 14, 12);
  });
});

describe('registry', () => {
  it('lists ATR and RSI with their defaults and RSI guides', () => {
    expect(INDICATORS.map((d) => d.id)).toEqual(['atr', 'rsi']);
    const r = INDICATOR_BY_ID.rsi;
    expect(r?.guides(r.defaults)).toEqual([70, 30]);
    expect(r?.range).toEqual({ min: 0, max: 100 });
    expect(INDICATOR_BY_ID.atr?.guides(INDICATOR_BY_ID.atr.defaults)).toEqual([]);
  });

  it('calc runs on bars', () => {
    const bars = Array.from({ length: 16 }, (_, i) => ({ open: i, high: i + 1, low: i - 1, close: i }));
    const r = INDICATOR_BY_ID.rsi;
    const a = INDICATOR_BY_ID.atr;
    expect(r?.calc(bars, r.defaults).at(-1)).toBe(100);
    expect(a?.calc(bars, a.defaults).at(-1)).toBeCloseTo(2, 12);
  });

  it('normalises settings: clamps, rounds, ignores junk', () => {
    const r = INDICATOR_BY_ID.rsi;
    if (!r) throw new Error('missing rsi');
    expect(normaliseSettings(r, { length: '21', overbought: 150, oversold: 'x' })).toEqual({
      length: 21,
      overbought: 99,
      oversold: 30,
    });
    expect(normaliseSettings(r, null)).toEqual(r.defaults);
    expect(normaliseSettings(r, { length: 0.4 })).toMatchObject({ length: 1 });
  });
});
