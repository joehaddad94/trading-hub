import type { OrderView } from '@trading/backtest';
import { newTicket } from '@trading/backtest-engine';
import { describe, expect, it } from 'vitest';
import { quotes, ticketTitle } from './order-ticket';
import { halfLots, openTotal } from './trade-panel';

describe('order ticket labels', () => {
  it('names market and pending tickets the way they will fill', () => {
    const buy = newTicket('long', 100, 2);
    expect(ticketTitle(buy, 100)).toBe('Buy');
    expect(ticketTitle({ ...buy, kind: 'pending', entry: 95 }, 100)).toBe('Buy limit');
    expect(ticketTitle({ ...newTicket('short', 100, 2), kind: 'pending', entry: 95 }, 100)).toBe('Sell stop');
  });

  it('bid is the last close, ask adds the spread', () => {
    expect(quotes(46000, '2.5', 2)).toEqual({ bid: '46000.00', ask: '46002.50' });
    expect(quotes(null, '2', 2)).toEqual({ bid: null, ask: null });
  });
});

describe('positions panel', () => {
  const order = (o: Partial<OrderView>): OrderView =>
    ({ instrument: 'US30', side: 'long', status: 'open', lots: '1.00', fillPrice: '100', ...o }) as OrderView;
  const us30 = { code: 'US30', pointValue: '1', priceDigits: 2 };

  it('adds up open P/L of this instrument only', () => {
    const orders = [order({}), order({ side: 'short', fillPrice: '104' }), order({ instrument: 'NAS100' })];
    expect(openTotal(orders, us30, 102)).toBe('4.00');
    expect(openTotal(orders, us30, null)).toBeNull();
    expect(openTotal([order({ status: 'pending' })], us30, 102)).toBeNull();
  });

  it('half a position rounds down to 0.01 lots', () => {
    expect(halfLots('0.27')).toBe('0.13');
  });
});
