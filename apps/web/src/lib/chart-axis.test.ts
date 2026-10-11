import { describe, expect, it } from 'vitest';
import { tradeAxisTicks } from './chart-axis';

const at = (iso: string) => new Date(iso).getTime();

describe('tradeAxisTicks', () => {
  it('ticks the first trade of each Beirut day', () => {
    const times = [
      at('2026-09-01T07:00:00Z'),
      at('2026-09-01T09:00:00Z'),
      at('2026-09-01T21:30:00Z'), // 00:30 on 2 Sep in Beirut
      at('2026-09-03T10:00:00Z'),
    ];
    expect(tradeAxisTicks(times)).toEqual({ ticks: [0, 2, 3], pattern: 'd MMM' });
  });

  it('thins to the maximum, keeping first and last', () => {
    const times = Array.from({ length: 20 }, (_, d) => at(`2026-09-${String(d + 1).padStart(2, '0')}T08:00:00Z`));
    const { ticks } = tradeAxisTicks(times, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(19);
  });

  it('uses clock times when every trade is on one day', () => {
    const times = [at('2026-09-01T07:00:00Z'), at('2026-09-01T08:00:00Z'), at('2026-09-01T09:00:00Z')];
    expect(tradeAxisTicks(times)).toEqual({ ticks: [0, 1, 2], pattern: 'HH:mm' });
  });

  it('handles an empty curve', () => {
    expect(tradeAxisTicks([]).ticks).toEqual([]);
  });
});
