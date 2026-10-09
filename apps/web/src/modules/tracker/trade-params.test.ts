import { describe, expect, it } from 'vitest';
import { parseTradeParams, tradeQuery } from './trade-params';

describe('trade params', () => {
  it('parses valid filters and drops bad ones', () => {
    const p = parseTradeParams({
      account: '7002880',
      side: 'sell',
      session: 'ny_am',
      weekday: '3',
      from: '2026-10-01',
      to: 'not-a-date',
      plan: 'maybe',
      sort: 'net',
      dir: 'asc',
      page: '2',
      symbol: ['US30', 'NDX100'],
      tag: '',
    });
    expect(p).toMatchObject({
      account: '7002880',
      side: 'sell',
      session: 'ny_am',
      weekday: 3,
      from: '2026-10-01',
      to: null,
      plan: null,
      sort: 'net',
      dir: 'asc',
      page: 2,
      symbol: 'US30',
      tag: null,
    });
    expect(parseTradeParams({ account: '1; drop table', sort: 'evil', page: '-1' })).toMatchObject({
      account: null,
      sort: 'closed',
      page: 1,
    });
  });

  it('round-trips into a query string, leaving defaults out', () => {
    const p = parseTradeParams({ symbol: 'US30', news: 'yes', sort: 'r' });
    expect(tradeQuery('account:7002880', p)).toBe('scope=account%3A7002880&symbol=US30&news=yes&sort=r');
    expect(tradeQuery('all', p, { page: 3, sort: 'closed' })).toBe('symbol=US30&news=yes&page=3');
  });
});
