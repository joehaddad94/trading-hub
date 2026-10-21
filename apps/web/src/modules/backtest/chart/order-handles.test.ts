import { describe, expect, it } from 'vitest';
import { levelLabel, pnlAt } from './order-handles';

const long = { entry: '42000.00', long: true, lots: '0.50', pointValue: '1' };

describe('order level lines', () => {
  it('prices a drop at the line for longs and shorts', () => {
    expect(pnlAt(long, 41950)).toBe('-25.00');
    expect(pnlAt(long, 42100)).toBe('50.00');
    expect(pnlAt({ ...long, long: false }, 41950)).toBe('25.00');
  });

  it('labels the line with level, price and money', () => {
    const data = { ...long, orderId: 'o', level: 'sl' as const, priceDigits: 2 };
    expect(levelLabel(data, 41950)).toBe('SL 41950.00 · −$25.00');
    expect(levelLabel({ ...data, level: 'tp' }, 42100)).toBe('TP 42100.00 · +$50.00');
  });
});
