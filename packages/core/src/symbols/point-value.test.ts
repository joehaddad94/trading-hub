import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { derivePointValue, type PointValueSample } from './point-value';

type T = { symbol: string; lots: string; open_price: number; close_price: number; profit: number };
const fixture = JSON.parse(
  readFileSync(new URL('../../../contract/fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url), 'utf8'),
) as { accounts: { cycles: { trades: T[] }[] }[] };
const samples = (symbol: string): PointValueSample[] =>
  fixture.accounts.flatMap((a) =>
    a.cycles.flatMap((c) =>
      c.trades
        .filter((t) => t.symbol === symbol)
        .map((t) => ({
          lots: t.lots,
          openPrice: String(t.open_price),
          closePrice: String(t.close_price),
          profit: String(t.profit),
        })),
    ),
  );

describe('derivePointValue', () => {
  it('finds $10 per point per lot for NDX100 and US30 in the real export', () => {
    expect(derivePointValue(samples('NDX100'))).toBe('10.0000');
    expect(derivePointValue(samples('US30'))).toBe('10.0000');
  });

  it('needs enough agreeing trades', () => {
    const one = { lots: '1', openPrice: '100', closePrice: '101', profit: '10' };
    expect(derivePointValue([one, one, one])).toBeNull();
    const noisy = [1, 2, 3, 4, 5, 6].map((n) => ({ ...one, profit: String(n * 7) }));
    expect(derivePointValue(noisy)).toBeNull();
    const flat = { ...one, closePrice: '100' };
    expect(derivePointValue([flat, flat, flat, flat, flat])).toBeNull();
    expect(derivePointValue([one, one, one, one, { ...one, profit: '10.1' }, one])).toBe('10.0000');
  });
});
