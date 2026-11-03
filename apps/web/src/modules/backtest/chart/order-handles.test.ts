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

  it('phones get short labels; a market ticket line shows no price (audit 3 Nov, #4 #6)', () => {
    const data = { ...long, orderId: 'o', level: 'tp' as const, priceDigits: 2, short: true };
    expect(levelLabel(data, 42100)).toBe('TP +$50.00');
    const entry = { ...data, orderId: 'draft', level: 'entry' as const, title: 'Buy market 0.50 · next open' };
    expect(levelLabel({ ...entry, market: true, short: false }, 42000)).toBe('Buy market 0.50 · next open');
    expect(levelLabel({ ...entry, market: true }, 42000)).toBe('Buy market 0.50');
    expect(levelLabel({ ...entry, title: 'Buy stop 0.50', short: false }, 42010)).toBe('Buy stop 0.50 · 42010.00');
  });
});
