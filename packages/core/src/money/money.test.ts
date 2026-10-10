import { describe, expect, it } from 'vitest';
import { money, sumMoney } from './money';

describe('sumMoney', () => {
  it('sums without float drift', () => {
    expect(sumMoney(['0.1', '0.2']).toString()).toBe('0.3');
    expect(sumMoney([0.1, 0.2]).equals(money('0.3'))).toBe(true);
  });

  it('returns zero for no values', () => {
    expect(sumMoney([]).isZero()).toBe(true);
  });

  it('handles negative P/L', () => {
    expect(sumMoney(['-1344.71', '1251.91', '2038.51']).toFixed(2)).toBe('1945.71');
  });
});
