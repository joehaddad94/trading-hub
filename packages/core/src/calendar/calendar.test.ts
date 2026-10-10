import { readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { tradeStats } from '../metrics/metrics';
import { buildMonth, type CalendarTrade, dayStats, parseMonth, shiftMonth, weekdayOf } from './calendar';
import { balanceAt, ruleUsage } from './rules';

type FixtureTrade = {
  ticket: string;
  symbol: string;
  type_str: string;
  lots: string;
  profit: number;
  commission: number;
  swap: number;
  open_time_str: string;
  close_time_str: string;
  is_news: number;
};
const fixture = JSON.parse(
  readFileSync(new URL('../../../contract/fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url), 'utf8'),
) as { accounts: { login: number; cycles: { trades: FixtureTrade[] }[] }[] };

/** Fixture times are server time UTC+03:00 (CLAUDE.md rule 13). */
const serverTime = (s: string) => new Date(`${s.replace(' ', 'T')}+03:00`);

const fixtureTrades: CalendarTrade[] = fixture.accounts.flatMap((a) =>
  a.cycles.flatMap((c) =>
    c.trades.map((t) => ({
      id: t.ticket,
      accountId: String(a.login),
      symbol: t.symbol,
      side: t.type_str === 'Buy' ? ('buy' as const) : ('sell' as const),
      lots: t.lots,
      openedAt: serverTime(t.open_time_str),
      closedAt: serverTime(t.close_time_str),
      netProfit: new Decimal(String(t.profit)).plus(String(t.commission)).plus(String(t.swap)).toFixed(2),
      commission: String(t.commission),
      swap: String(t.swap),
      riskUsd: null,
      isNews: t.is_news === 1,
      journaled: false,
      followedPlan: null,
    })),
  ),
);

const trade = (over: Partial<CalendarTrade>): CalendarTrade => ({
  id: 'x',
  accountId: 'a',
  symbol: 'NDX100',
  side: 'buy',
  lots: '1',
  openedAt: new Date('2026-10-05T13:40:00Z'),
  closedAt: new Date('2026-10-05T14:00:00Z'),
  netProfit: '10',
  commission: '0',
  swap: '0',
  riskUsd: null,
  isNews: false,
  journaled: false,
  followedPlan: null,
  ...over,
});

describe('buildMonth on the fixture (account 7002880, October 2026)', () => {
  const trades = fixtureTrades.filter((t) => t.accountId === '7002880');
  const cal = buildMonth({ year: 2026, month: 10, trades, today: new Date('2026-10-09T08:00:00Z') });
  const days = cal.weeks.flatMap((w) => w.days.filter((d) => d.stats));

  it('day totals add up to the metrics package output for the month', () => {
    const inMonth = trades.filter((t) => t.closedAt >= new Date('2026-09-30T21:00:00Z'));
    const sum = Decimal.sum(...days.map((d) => d.stats?.net ?? new Decimal(0)));
    expect(sum.toFixed(2)).toBe(tradeStats(inMonth).net.toFixed(2));
    expect(cal.summary.net.toFixed(2)).toBe(sum.toFixed(2));
    expect(cal.summary.trades).toBe(inMonth.length);
    expect(cal.summary.tradingDays).toBe(days.length);
    expect(cal.summary.greenDays + cal.summary.redDays).toBeLessThanOrEqual(days.length);
  });

  it('weekly summaries add up to the month', () => {
    const weekly = Decimal.sum(...cal.weeks.map((w) => w.summary.net));
    expect(weekly.toFixed(2)).toBe(cal.summary.net.toFixed(2));
    expect(cal.weeks.reduce((n, w) => n + w.summary.trades, 0)).toBe(cal.summary.trades);
  });

  it('is a Mon–Fri grid starting on the Monday before the 1st, with today boxed', () => {
    expect(cal.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(cal.weeks[0]?.days[0]?.date).toBe('2026-09-28');
    expect(cal.weeks.at(-1)?.days.at(-1)?.date).toBe('2026-10-30');
    expect(cal.weeks).toHaveLength(5);
    const today = cal.weeks.flatMap((w) => w.days).filter((d) => d.isToday);
    expect(today.map((d) => d.date)).toEqual(['2026-10-09']); // Friday 9 Oct
  });

  it('scales tile intensity to the largest absolute day', () => {
    const intensities = days.map((d) => d.intensity);
    expect(Math.max(...intensities)).toBe(1);
    expect(Math.min(...intensities)).toBeGreaterThan(0);
  });
});

describe('buildMonth details', () => {
  it('adds weekend columns only when a weekend trade exists', () => {
    const sat = trade({ closedAt: new Date('2026-10-10T10:00:00Z'), openedAt: new Date('2026-10-10T09:00:00Z') });
    const cal = buildMonth({ year: 2026, month: 10, trades: [sat], today: new Date('2026-10-01T10:00:00Z') });
    expect(cal.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(cal.weeks.flatMap((w) => w.days).find((d) => d.stats)?.date).toBe('2026-10-10');
  });

  it('ignores trades outside the month and pads with days from neighbouring months', () => {
    const cal = buildMonth({
      year: 2026,
      month: 11,
      trades: [trade({ closedAt: new Date('2026-10-30T10:00:00Z') })],
      today: new Date('2026-10-01T10:00:00Z'),
    });
    expect(cal.summary.trades).toBe(0);
    // 1 Nov 2026 is a Sunday: with no weekend columns, that week has nothing to show.
    expect(cal.weeks[0]?.days[0]).toMatchObject({ date: '2026-11-02', inMonth: true });
    expect(cal.weeks.at(-1)?.days.at(-1)).toMatchObject({ date: '2026-12-04', inMonth: false });
    expect(cal.summary.bestDay).toBeNull();
    expect(cal.summary.avgTradesPerDay).toBeNull();
  });

  it('computes streaks, best/worst day and plan adherence', () => {
    const on = (d: number, net: string, followedPlan: boolean | null = null) =>
      trade({
        closedAt: new Date(`2026-10-${String(d).padStart(2, '0')}T12:00:00Z`),
        openedAt: new Date(`2026-10-${String(d).padStart(2, '0')}T11:00:00Z`),
        netProfit: net,
        commission: '-1',
        swap: '-0.5',
        followedPlan,
        journaled: followedPlan !== null,
      });
    const cal = buildMonth({
      year: 2026,
      month: 10,
      trades: [on(1, '10', true), on(2, '20', true), on(5, '-5', false), on(6, '30'), on(7, '-1'), on(8, '-2')],
      today: new Date('2026-10-20T10:00:00Z'),
    });
    expect(cal.summary).toMatchObject({ longestGreenStreak: 2, longestRedStreak: 2, tradingDays: 6 });
    expect(cal.summary.bestDay).toMatchObject({ date: '2026-10-06' });
    expect(cal.summary.worstDay).toMatchObject({ date: '2026-10-05' });
    expect(cal.summary.commissionSwap.toFixed(2)).toBe('-9.00');
    expect(cal.summary.planFollowedRate?.toFixed(4)).toBe('0.6667');
    expect(cal.summary.avgTradesPerDay?.toNumber()).toBe(1);
  });
});

describe('dayStats', () => {
  it('summarises a day across accounts', () => {
    const s = dayStats('2026-10-05', [
      trade({ id: '1', accountId: 'a', netProfit: '50', lots: '0.5', isNews: true, journaled: true }),
      trade({ id: '2', accountId: 'b', symbol: 'US30', netProfit: '-20', lots: '1.25', journaled: true }),
      trade({ id: '3', accountId: 'a', netProfit: '-5', openedAt: new Date('2026-10-05T06:30:00Z') }),
    ]);
    expect(s.best?.id).toBe('1');
    expect(s.worst?.id).toBe('2');
    expect(s.lots.toFixed(2)).toBe('2.75');
    expect(s.symbols).toEqual(['NDX100', 'US30']);
    expect(s.sessions.sort()).toEqual(['london', 'ny_am']);
    expect(s.byAccount.map((a) => [a.accountId, a.net.toNumber()])).toEqual([
      ['a', 45],
      ['b', -20],
    ]);
    expect(s.hasNews).toBe(true);
    expect(s.journaled).toBe(false);
    expect(s.followedPlan).toBeNull();
    expect(s.avgHoldMs).toBeGreaterThan(0);
  });

  it('handles an empty day', () => {
    const s = dayStats('2026-10-05', []);
    expect([s.best, s.worst, s.avgHoldMs]).toEqual([null, null, null]);
    expect(s.journaled).toBe(false);
  });
});

describe('month helpers', () => {
  it('shifts across years and parses month params', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(parseMonth('2026-10')).toEqual({ year: 2026, month: 10 });
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('nope')).toBeNull();
    expect(weekdayOf('2026-10-11')).toBe(7);
  });
});

describe('rule usage', () => {
  const trades = [
    { closedAt: new Date('2026-10-05T10:00:00Z'), netProfit: '-300' },
    { closedAt: new Date('2026-10-06T10:00:00Z'), netProfit: '-700' },
    { closedAt: new Date('2026-10-06T11:00:00Z'), netProfit: '400' },
    { closedAt: new Date('2026-10-07T10:00:00Z'), netProfit: '100' },
  ];
  const day = { dayStart: new Date('2026-10-05T21:00:00Z'), dayEnd: new Date('2026-10-06T21:00:00Z') };

  it('rebuilds balances from a snapshot or the starting balance', () => {
    const snap = { at: new Date('2026-10-07T12:00:00Z'), balance: '24500' };
    expect(balanceAt({ startingBalance: '25000', snapshot: null, trades }, day.dayStart).toFixed(2)).toBe('24700.00');
    expect(balanceAt({ startingBalance: '25000', snapshot: snap, trades }, day.dayStart).toFixed(2)).toBe('24700.00');
    const early = { at: new Date('2026-10-05T12:00:00Z'), balance: '24700' };
    expect(balanceAt({ startingBalance: '25000', snapshot: early, trades }, day.dayEnd).toFixed(2)).toBe('24400.00');
  });

  it('measures daily loss used against the limit and distance to max loss', () => {
    const u = ruleUsage({
      startingBalance: '25000',
      snapshot: null,
      trades,
      ...day,
      dailyLossPct: '5',
      maxLossPct: '10',
    });
    expect(u.startBalance.toFixed(2)).toBe('24700.00');
    expect(u.endBalance.toFixed(2)).toBe('24400.00');
    expect(u.dailyLossUsed.toFixed(2)).toBe('700.00');
    expect(u.dailyLossLimit?.toFixed(2)).toBe('1250.00');
    expect(u.dailyLossUsedShare?.toFixed(2)).toBe('0.56');
    expect(u.maxLossFloor?.toFixed(2)).toBe('22500.00');
    expect(u.distanceToMaxLoss?.toFixed(2)).toBe('1900.00');
    expect(u.warning).toBe(false);
  });

  it('warns near either limit and copes without limits', () => {
    const big = [{ closedAt: new Date('2026-10-06T10:00:00Z'), netProfit: '-1100' }];
    expect(
      ruleUsage({ startingBalance: '25000', snapshot: null, trades: big, ...day, dailyLossPct: '5', maxLossPct: '10' })
        .warning,
    ).toBe(true);
    const deep = { at: new Date('2026-10-01T00:00:00Z'), balance: '22800' };
    expect(
      ruleUsage({ startingBalance: '25000', snapshot: deep, trades: [], ...day, dailyLossPct: '5', maxLossPct: '10' })
        .warning,
    ).toBe(true);
    const none = ruleUsage({
      startingBalance: '25000',
      snapshot: null,
      trades,
      ...day,
      dailyLossPct: null,
      maxLossPct: null,
    });
    expect([
      none.dailyLossLimit,
      none.dailyLossUsedShare,
      none.maxLossFloor,
      none.distanceToMaxLoss,
      none.warning,
    ]).toEqual([null, null, null, null, false]);
  });
});
