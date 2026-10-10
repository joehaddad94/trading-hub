import { dayStats } from '@trading/core';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { cellValue, formatHold, formatMoneyShort, formatR, pluralTrades } from './format';

const base = {
  accountId: 'a',
  symbol: 'NDX100',
  side: 'buy' as const,
  lots: '1',
  openedAt: new Date('2026-10-05T13:40:00Z'),
  closedAt: new Date('2026-10-05T14:00:00Z'),
  commission: '0',
  swap: '0',
  isNews: false,
  journaled: false,
  followedPlan: null,
};
const stats = dayStats('2026-10-05', [
  { ...base, id: '1', netProfit: '383.70', riskUsd: '100', riskSource: 'journal_usd' },
  { ...base, id: '2', netProfit: '-100.00', riskUsd: '100', riskSource: 'journal_usd' },
]);

describe('calendar cell values', () => {
  it.each([
    ['net', false, '$283.70'],
    ['net', true, '$284'],
    ['r', false, '+2.84R'],
    ['count', false, '2 trades'],
    ['winrate', false, '50%'],
    ['pct', false, '1.13%'],
  ] as const)('%s (short=%s)', (mode, short, expected) => {
    expect(cellValue(stats, mode, '25000', short)).toBe(expected);
  });

  it('handles missing values', () => {
    expect(cellValue(stats, 'pct', '0')).toBe('—');
    expect(formatR(null)).toBe('—');
    expect(formatR(new Decimal('-1.5'))).toBe('-1.50R');
    expect(formatMoneyShort(new Decimal('-1234.5'))).toBe('-$1,235');
    expect(pluralTrades(1)).toBe('1 trade');
  });

  it('formats hold times', () => {
    expect(formatHold(null)).toBe('—');
    expect(formatHold(17_000)).toBe('17s');
    expect(formatHold(25 * 60_000)).toBe('25m');
    expect(formatHold(135 * 60_000)).toBe('2h 15m');
  });
});
