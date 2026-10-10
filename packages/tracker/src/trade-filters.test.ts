import { describe, expect, it } from 'vitest';
import { filterOptions, filterTrades, type ListTrade, tradesToCsv } from './trade-filters';

const t = (over: Partial<ListTrade>): ListTrade => ({
  id: 'id',
  accountId: 'a1',
  ticket: 'T1',
  symbol: 'NDX100',
  side: 'buy',
  lots: '0.50',
  openedAt: new Date('2026-10-05T13:40:00Z'), // NY AM
  closedAt: new Date('2026-10-05T14:00:00Z'), // Monday in Beirut
  openPrice: '20000',
  closePrice: '20010',
  slFinal: null,
  tpFinal: null,
  netProfit: '50.00',
  commission: '0',
  swap: '0',
  riskUsd: '100.00',
  riskSource: 'estimated',
  firmRr: null,
  isNews: false,
  journaled: false,
  followedPlan: null,
  tags: [],
  ...over,
});

const trades = [
  t({ id: '1' }),
  t({
    id: '2',
    accountId: 'a2',
    symbol: 'US30',
    side: 'sell',
    netProfit: '-120.00',
    lots: '1.00',
    openedAt: new Date('2026-10-06T06:30:00Z'), // London
    closedAt: new Date('2026-10-06T08:00:00Z'), // Tuesday
    isNews: true,
    followedPlan: false,
    journaled: true,
    tags: ['breakout'],
  }),
  t({
    id: '3',
    netProfit: '200.00',
    followedPlan: true,
    journaled: true,
    tags: ['breakout', 'a+'],
    closedAt: new Date('2026-10-07T14:30:00Z'),
  }),
];
const ctx = { loginOf: (id: string) => (id === 'a1' ? '7002880' : '3028722') };
const ids = (ts: ListTrade[]) => ts.map((x) => x.id);

describe('filterTrades', () => {
  it.each([
    [{}, ['3', '2', '1']],
    [{ account: '3028722' }, ['2']],
    [{ symbol: 'NDX100' }, ['3', '1']],
    [{ side: 'sell' as const }, ['2']],
    [{ session: 'london' as const }, ['2']],
    [{ weekday: 1 }, ['1']],
    [{ tag: 'breakout' }, ['3', '2']],
    [{ plan: 'yes' as const }, ['3']],
    [{ plan: 'no' as const }, ['2']],
    [{ plan: 'unanswered' as const }, ['1']],
    [{ news: 'yes' as const }, ['2']],
    [{ news: 'no' as const }, ['3', '1']],
    [{ from: '2026-10-06', to: '2026-10-06' }, ['2']],
  ])('%j', (filters, expected) => {
    expect(ids(filterTrades(trades, filters, ctx))).toEqual(expected);
  });

  it('sorts by every key, both ways', () => {
    expect(ids(filterTrades(trades, { sort: 'net', dir: 'asc' }, ctx))).toEqual(['2', '1', '3']);
    expect(ids(filterTrades(trades, { sort: 'r' }, ctx))).toEqual(['3', '1', '2']);
    expect(ids(filterTrades(trades, { sort: 'symbol', dir: 'asc' }, ctx))).toEqual(['1', '3', '2']);
    expect(ids(filterTrades(trades, { sort: 'lots' }, ctx))).toEqual(['2', '3', '1']);
    expect(ids(filterTrades(trades, { sort: 'hold' }, ctx))).toEqual(['3', '2', '1']);
    expect(ids(filterTrades(trades, { sort: 'closed', dir: 'asc' }, ctx))).toEqual(['1', '2', '3']);
  });

  it('lists filter options', () => {
    expect(filterOptions(trades)).toEqual({ symbols: ['NDX100', 'US30'], tags: ['a+', 'breakout'] });
  });
});

describe('tradesToCsv', () => {
  it('writes exact decimals, UTC times and escaped cells', () => {
    const csv = tradesToCsv([t({ tags: ['say "hi"', 'x,y'] }), t({ ticket: '=HYPERLINK("x")' })], {
      ...ctx,
      phaseOf: () => 'funded',
    });
    const [header, first, second] = csv.split('\r\n');
    expect(header?.startsWith('account,phase,ticket')).toBe(true);
    expect(first).toContain('7002880,funded,T1,NDX100,buy,0.50,2026-10-05T13:40:00.000Z');
    expect(first).toContain(',50.00,');
    expect(first).toContain(',0.50,'); // R = 50 / 100
    expect(first).toContain('"say ""hi""; x,y"');
    expect(second).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
