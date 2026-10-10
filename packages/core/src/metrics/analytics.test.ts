import { describe, expect, it } from 'vitest';
import { type AnalyticsTrade, breakdowns, holdTimeStats, liveVsBacktest, rDistribution, streaks } from './analytics';

const t = (net: string, risk: string | null, opts: Partial<AnalyticsTrade> = {}): AnalyticsTrade => ({
  netProfit: net,
  riskUsd: risk,
  riskSource: 'journal_sl',
  symbol: 'US30',
  // Tue 6 Oct 2026 13:40 UTC = 09:40 New York (NY AM) = 16:40 Beirut.
  openedAt: new Date('2026-10-06T13:40:00Z'),
  closedAt: new Date('2026-10-06T13:50:00Z'),
  ...opts,
});

describe('rDistribution', () => {
  it('bins R in half steps with tails and counts unknown risk', () => {
    const { bins, unknown } = rDistribution([
      t('100', '100'),
      t('-100', '100'),
      t('-500', '100'),
      t('700', '100'),
      t('5', null),
    ]);
    expect(unknown).toBe(1);
    const count = (label: string) => bins.find((b) => b.label === label)?.count;
    expect(count('1R')).toBe(1);
    expect(count('-1R')).toBe(1);
    expect(count('< -3R')).toBe(1);
    expect(count('≥ 5R')).toBe(1);
    expect(bins).toHaveLength(18);
  });
});

describe('breakdowns', () => {
  it('groups by symbol, NY session, local hour and weekday', () => {
    const trades = [
      t('100', '100'),
      t('-50', '100', { symbol: 'NDX100', openedAt: new Date('2026-10-07T07:00:00Z') }), // 03:00 NY London, Wed
    ];
    const b = breakdowns(trades, 'Asia/Beirut');
    expect(b.symbol.map((g) => [g.key, g.stats.trades])).toEqual([
      ['NDX100', 1],
      ['US30', 1],
    ]);
    expect(b.session.map((g) => g.label)).toEqual(['London', 'NY AM']);
    expect(b.hour.map((g) => g.label)).toEqual(['10:00', '16:00']);
    expect(b.weekday.map((g) => g.label)).toEqual(['Tue', 'Wed']);
    expect(b.symbol[1]?.stats.net.toString()).toBe('100');
  });
});

describe('streaks', () => {
  it('finds the longest runs and the current one; scratches break runs', () => {
    const at = (i: number) => ({ closedAt: new Date(Date.UTC(2026, 9, 1, i)) });
    const s = streaks([
      t('100', '100', at(1)),
      t('100', '100', at(2)),
      t('-100', '100', at(3)),
      t('-100', '100', at(4)),
      t('-100', '100', at(5)),
      t('1', '100', at(6)), // scratch
      t('100', '100', at(7)),
    ]);
    expect(s).toEqual({ longestWin: 2, longestLoss: 3, current: { kind: 'win', length: 1 } });
    expect(streaks([])).toEqual({ longestWin: 0, longestLoss: 0, current: { kind: null, length: 0 } });
  });
});

describe('holdTimeStats', () => {
  it('buckets by hold time', () => {
    const open = new Date('2026-10-06T13:00:00Z');
    const g = holdTimeStats([
      t('10', '100', { openedAt: open, closedAt: new Date(open.getTime() + 30_000) }),
      t('10', '100', { openedAt: open, closedAt: new Date(open.getTime() + 2 * 3600_000) }),
      t('10', '100', { openedAt: open, closedAt: new Date(open.getTime() + 9 * 3600_000) }),
    ]);
    expect(g.map((x) => x.label)).toEqual(['< 1 min', '1–4 h', '> 4 h']);
  });
});

describe('liveVsBacktest', () => {
  it('compares per symbol with an all-symbols row and the expectancy gap', () => {
    const rows = liveVsBacktest(
      [t('-100', '100'), t('100', '100', { symbol: 'NDX100' })],
      [t('200', '100'), t('100', '100')],
    );
    expect(rows.map((r) => r.symbol)).toEqual(['NDX100', 'US30', 'All symbols']);
    const us30 = rows[1];
    expect(us30?.live?.expectancyR?.toNumber()).toBe(-1);
    expect(us30?.backtest?.expectancyR?.toNumber()).toBe(1.5);
    expect(us30?.expectancyGapR?.toNumber()).toBe(2.5);
    expect(rows[0]?.backtest).toBeNull();
    expect(rows[0]?.expectancyGapR).toBeNull();
    expect(rows[2]?.expectancyGapR?.toNumber()).toBe(1.5);
    expect(liveVsBacktest([t('1', '1')], [])).toHaveLength(1);
  });
});
