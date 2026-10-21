import type { Bar } from '@trading/backtest-engine';
import { describe, expect, it } from 'vitest';
import { extendTape, refillFrom, rewindTape, stepFromTape, type Tape, tapeCovers, trimTape } from './tape';

const M = 60_000;
const T0 = Date.parse('2026-10-07T14:00:00Z');
const bar = (ts: number): Bar => ({ ts, open: 1, high: 2, low: 0, close: 1, volume: 0 });
const minutes = (from: number, n: number) => Array.from({ length: n }, (_, i) => bar(from + i * M));
const tape = (from: number, to: number, bars: Bar[], ended = false): Tape => ({
  instrument: 'US30',
  from,
  to,
  bars,
  ended,
});

describe('tape', () => {
  it('starts at the cursor and extends from its end', () => {
    const first = refillFrom(null, 'US30', T0);
    expect(first.after).toBe(T0 + M);
    const t = extendTape(
      first.base,
      { bars: minutes(T0 + M, 30), hasMore: true },
      T0 + M,
      T0 + 14 * 86_400_000,
      T0 + 86_400_000,
    );
    expect(t).toMatchObject({ from: T0 + M, to: T0 + 30 * M, ended: false });
    expect(refillFrom(t, 'US30', T0 + 5 * M).after).toBe(T0 + 31 * M);
    // Another instrument, or a cursor outside the tape, starts over.
    expect(refillFrom(t, 'NAS100', T0).after).toBe(T0 + M);
    expect(refillFrom(t, 'US30', T0 + 90 * M).after).toBe(T0 + 91 * M);
  });

  it('a short page covers its whole range, and reaching now ends the data', () => {
    const base = refillFrom(null, 'US30', T0).base;
    const now = T0 + 20 * M + 30_000;
    const t = extendTape(base, { bars: minutes(T0 + M, 10), hasMore: false }, T0 + M, T0 + 86_400_000, now);
    expect(t).toMatchObject({ to: T0 + 20 * M, ended: true });
  });

  it('steps a 5m bar from buffered minutes, never past the target', () => {
    const t = tape(T0 + M, T0 + 60 * M, minutes(T0 + M, 60));
    const move = stepFromTape(t, T0 + 2 * M, 5, 'bar', 1);
    expect(move).toMatchObject({ target: T0 + 4 * M });
    if (typeof move === 'string') throw new Error('expected a move');
    expect(move.bars.map((b) => b.ts)).toEqual([T0 + 3 * M, T0 + 4 * M]);
  });

  it('asks for more when the target is past the tape, and ends at the end of data', () => {
    const t = tape(T0 + M, T0 + 6 * M, minutes(T0 + M, 6));
    expect(stepFromTape(t, T0 + 4 * M, 5, 'bar', 2)).toBe('more');
    expect(stepFromTape({ ...t, ended: true }, T0 + 6 * M, 5, 'bar', 1)).toBe('end');
  });

  it('skips a closed market to just before the next candle', () => {
    const monday = T0 + 3 * 86_400_000;
    const t = tape(T0 + M, monday + 10 * M, [bar(T0 + M), ...minutes(monday, 10)]);
    const move = stepFromTape(t, T0 + M, 1, 'bar', 1);
    expect(move).toMatchObject({ target: monday });
  });

  it('trims far history and drops itself when stepping back out of it', () => {
    const t = tape(T0, T0 + 3000 * M, minutes(T0, 3001));
    const trimmed = trimTape(t, T0 + 2000 * M);
    expect(trimmed.bars.filter((b) => b.ts <= T0 + 2000 * M)).toHaveLength(1500);
    expect(tapeCovers(trimmed, 'US30', T0 + 600 * M)).toBe(true);
    expect(rewindTape(trimmed, 'US30', T0 + 100 * M)).toBeNull();
  });
});
