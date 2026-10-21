import type { Bar } from '@trading/backtest-engine';
import { describe, expect, it } from 'vitest';
import { rewindBars } from './use-replay';

const M = 60_000;
const T0 = Date.parse('2026-10-07T14:00:00Z');
const bar = (ts: number, close = 100): Bar => ({ ts, open: close, high: close + 1, low: close - 1, close, volume: 0 });

describe('rewindBars', () => {
  it('drops the newest bar and parks on the last minute of the one before', () => {
    const bars = [bar(T0), bar(T0 + 5 * M), bar(T0 + 10 * M)];
    // Cursor in the forming 14:10 bar.
    expect(rewindBars(bars, T0 + 12 * M, 5, 'bar', null)).toEqual({ target: T0 + 9 * M, bars: bars.slice(0, 2) });
    // Cursor at the end of a complete 14:10 bar: that bar goes.
    expect(rewindBars(bars, T0 + 14 * M, 5, 'bar', null)).toEqual({ target: T0 + 9 * M, bars: bars.slice(0, 2) });
  });

  it('skips an empty weekend in one press', () => {
    const friday = Date.parse('2026-10-09T20:55:00Z');
    const monday = Date.parse('2026-10-11T22:00:00Z');
    const bars = [bar(friday - 5 * M), bar(friday), bar(monday)];
    expect(rewindBars(bars, monday + 2 * M, 5, 'bar', null)).toEqual({
      target: friday + 4 * M,
      bars: bars.slice(0, 2),
    });
  });

  it('says when nothing earlier is loaded', () => {
    expect(rewindBars([bar(T0)], T0 + 2 * M, 5, 'bar', null)).toBe('start');
  });

  it('rebuilds the forming bar from the minute log', () => {
    const bars = [bar(T0), bar(T0 + 5 * M, 103)];
    const log = { from: T0 + 5 * M, to: T0 + 8 * M, bars: [0, 1, 2, 3].map((i) => bar(T0 + (5 + i) * M, 100 + i)) };
    const back = rewindBars(bars, T0 + 8 * M, 5, 'minute', log);
    expect(back).toMatchObject({ target: T0 + 7 * M });
    if (!back || back === 'start') throw new Error('expected bars');
    expect(back.bars).toHaveLength(2);
    expect(back.bars[1]).toMatchObject({ ts: T0 + 5 * M, open: 100, close: 102, high: 103, low: 99 });
  });

  it('asks for minutes when the log does not reach the bar start', () => {
    const log = { from: T0 + 7 * M, to: T0 + 8 * M, bars: [bar(T0 + 7 * M), bar(T0 + 8 * M)] };
    expect(rewindBars([bar(T0 + 5 * M)], T0 + 8 * M, 5, 'minute', log)).toBeNull();
  });

  it('a minute back that closes the previous bar needs no log', () => {
    const bars = [bar(T0), bar(T0 + 5 * M)];
    expect(rewindBars(bars, T0 + 5 * M, 5, 'minute', null)).toEqual({ target: T0 + 4 * M, bars: [bars[0]] });
  });
});
