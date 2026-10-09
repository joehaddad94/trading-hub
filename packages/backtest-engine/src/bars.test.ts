import { describe, expect, it } from 'vitest';
import { aggregate, type Bar, bucketStart, isBarComplete, parseTimeframe, visibleUntil } from './bars';

const T0 = Date.parse('2026-10-07T13:30:00Z');
const M = 60_000;

/** Deterministic pseudo-random walk of 1m bars, with some minutes missing. */
function minuteBars(count: number, skip: (i: number) => boolean = () => false): Bar[] {
  const bars: Bar[] = [];
  let price = 46000;
  for (let i = 0; i < count; i += 1) {
    const move = ((i * 7919) % 13) - 6;
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + (i % 3);
    const low = Math.min(open, close) - (i % 4);
    price = close;
    if (!skip(i)) bars.push({ ts: T0 + i * M, open, high, low, close, volume: (i % 5) + 1 });
  }
  return bars;
}

/** Reference implementation, written the slow obvious way. */
function reference(bars: Bar[], tf: number): Bar[] {
  const groups = new Map<number, Bar[]>();
  for (const b of bars) {
    const key = Math.floor(b.ts / (tf * M)) * tf * M;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.entries()].map(([ts, g]) => ({
    ts,
    open: g[0]?.open ?? 0,
    high: Math.max(...g.map((b) => b.high)),
    low: Math.min(...g.map((b) => b.low)),
    close: g[g.length - 1]?.close ?? 0,
    volume: g.reduce((s, b) => s + b.volume, 0),
  }));
}

describe('aggregate', () => {
  const bars = minuteBars(600, (i) => i % 37 === 0 || (i > 200 && i < 230));

  it.each([5, 15] as const)('%im bars match an aggregation of the 1m data', (tf) => {
    expect(aggregate(bars, tf)).toEqual(reference(bars, tf));
  });

  it('aligns buckets to the UTC hour', () => {
    expect(aggregate(minuteBars(20), 15).map((b) => new Date(b.ts).toISOString())).toEqual([
      '2026-10-07T13:30:00.000Z',
      '2026-10-07T13:45:00.000Z',
    ]);
    expect(bucketStart(Date.parse('2026-10-07T13:44:59Z'), 15)).toBe(Date.parse('2026-10-07T13:30:00Z'));
    expect(bucketStart(Date.parse('2026-10-07T13:07:00Z'), 5)).toBe(Date.parse('2026-10-07T13:05:00Z'));
  });

  it('passes 1m bars through as copies', () => {
    const one = minuteBars(3);
    const out = aggregate(one, 1);
    expect(out).toEqual(one);
    expect(out[0]).not.toBe(one[0]);
  });
});

describe('forming bars (no lookahead)', () => {
  const all = minuteBars(30);

  it('builds the 15m forming bar only from minutes up to the cursor, updating minute by minute', () => {
    const closes: number[] = [];
    for (let i = 15; i < 30; i += 1) {
      const cursor = T0 + i * M;
      const bars = aggregate(visibleUntil(all, cursor), 15);
      const forming = bars[bars.length - 1] as Bar;
      expect(forming.ts).toBe(T0 + 15 * M);
      expect(forming.close).toBe(all[i]?.close);
      expect(forming.high).toBe(Math.max(...all.slice(15, i + 1).map((b) => b.high)));
      expect(isBarComplete(forming.ts, 15, cursor)).toBe(i === 29);
      closes.push(forming.close);
    }
    expect(new Set(closes).size).toBeGreaterThan(1);
  });

  it('never returns a minute after the cursor', () => {
    const cursor = T0 + 7 * M;
    expect(visibleUntil(all, cursor).every((b) => b.ts <= cursor)).toBe(true);
    expect(visibleUntil(all, cursor)).toHaveLength(8);
  });
});

describe('parseTimeframe', () => {
  it('accepts 1, 5, 15 only', () => {
    expect(parseTimeframe('5')).toBe(5);
    expect(parseTimeframe(15)).toBe(15);
    expect(parseTimeframe('60')).toBeNull();
    expect(parseTimeframe(undefined)).toBeNull();
  });
});
