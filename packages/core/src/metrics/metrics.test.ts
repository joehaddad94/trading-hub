import { readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { breakevenWinRate, classify, equityCurve, maxDrawdown, rMultiple, tradeStats } from './metrics';

type FixtureTrade = { profit: number; commission: number; swap: number };
const fixture = JSON.parse(
  readFileSync(new URL('../../../contract/fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url), 'utf8'),
) as {
  accounts: { login: string | number; cycles: { stats: Record<string, number> | null; trades: FixtureTrade[] }[] }[];
};

const net = (t: FixtureTrade) =>
  new Decimal(String(t.profit)).plus(String(t.commission)).plus(String(t.swap)).toFixed(2);

describe('tradeStats against FundedNext (account 7002880, current cycle)', () => {
  const cycle = fixture.accounts.find((a) => String(a.login) === '7002880')?.cycles[0];
  if (!cycle?.stats) throw new Error('fixture changed');
  const stats = tradeStats(cycle.trades.map((t) => ({ netProfit: net(t), riskUsd: null })));

  it('matches trade count, win rate and profit factor', () => {
    expect(stats.trades).toBe(cycle.stats?.total_trades);
    expect(stats.wins).toBe(12);
    expect(stats.losses).toBe(22);
    expect(stats.winRate?.times(100).toDecimalPlaces(2).toNumber()).toBe(cycle.stats?.win_rate);
    expect(stats.profitFactor?.toDecimalPlaces(2).toNumber()).toBe(cycle.stats?.profit_factor);
  });

  it('matches average win / average loss ratio', () => {
    const ratio = stats.avgWin?.div(stats.avgLoss?.abs() ?? 1);
    expect(ratio?.toDecimalPlaces(2).toNumber()).toBe(cycle.stats?.average_win_loss_trade);
    expect(stats.avgWin?.toFixed(2)).toBe('112.14');
    expect(stats.avgLoss?.toFixed(2)).toBe('-122.29');
  });

  it('net equals gross profit minus gross loss', () => {
    expect(stats.net.toFixed(2)).toBe(stats.grossProfit.minus(stats.grossLoss).toFixed(2));
  });

  it('has no R metrics without risk', () => {
    expect(stats.rTrades).toBe(0);
    expect(stats.expectancyR).toBeNull();
    expect(stats.breakevenWinRate).toBeNull();
  });
});

describe('R metrics', () => {
  const trades = [
    { netProfit: '200.00', riskUsd: '100.00' }, // +2R
    { netProfit: '-100.00', riskUsd: '100.00' }, // -1R
    { netProfit: '-100.00', riskUsd: '100.00' }, // -1R
    { netProfit: '5.00', riskUsd: '100.00' }, // scratch
    { netProfit: '50.00', riskUsd: null }, // win, no R
  ];
  const s = tradeStats(trades);

  it('classifies scratches separately and never as wins', () => {
    expect([s.wins, s.losses, s.scratches]).toEqual([2, 2, 1]);
    expect(s.winRate?.toNumber()).toBe(0.4);
    expect(classify({ netProfit: '0', riskUsd: null })).toBe('scratch');
    expect(classify({ netProfit: '5', riskUsd: '125', riskSource: 'estimated' })).toBe('win');
    expect(classify({ netProfit: '5', riskUsd: '125', riskSource: 'full_stop_loss' })).toBe('scratch');
  });

  it('computes R averages, expectancy and breakeven win rate', () => {
    expect(s.rTrades).toBe(4);
    expect(s.avgWinR?.toNumber()).toBe(2);
    expect(s.avgLossR?.toNumber()).toBe(-1);
    expect(s.netR?.toNumber()).toBe(0.05);
    expect(s.expectancyR?.toNumber()).toBe(0.0125);
    expect(s.breakevenWinRate?.toFixed(4)).toBe('0.3333');
  });

  it('rMultiple rejects missing or non-positive risk', () => {
    expect(rMultiple('10', null)).toBeNull();
    expect(rMultiple('10', '0')).toBeNull();
    expect(rMultiple('-50', '25')?.toNumber()).toBe(-2);
  });

  it('breakevenWinRate is 1/(1+avgWinR)', () => {
    expect(breakevenWinRate(new Decimal(1))?.toNumber()).toBe(0.5);
    expect(breakevenWinRate(null)).toBeNull();
    expect(breakevenWinRate(new Decimal(0))).toBeNull();
  });

  it('handles no trades and no losses', () => {
    const empty = tradeStats([]);
    expect(empty.winRate).toBeNull();
    expect(empty.profitFactor).toBeNull();
    expect(tradeStats([{ netProfit: '10', riskUsd: null }]).profitFactor).toBeNull();
  });
});

describe('equity curve and drawdown', () => {
  it('sorts by close time and accumulates from 0', () => {
    const curve = equityCurve([
      { netProfit: '-50', riskUsd: null, closedAt: new Date('2026-10-02'), accountId: 'b' },
      { netProfit: '100', riskUsd: null, closedAt: new Date('2026-10-01'), accountId: 'a' },
    ]);
    expect(curve.map((p) => [p.accountId, p.equity.toNumber()])).toEqual([
      ['a', 100],
      ['b', 50],
    ]);
  });

  it('finds the largest peak-to-trough fall', () => {
    const dd = maxDrawdown(['100', '-30', '50', '-120', '10'], '1000');
    expect(dd?.amount.toNumber()).toBe(120);
    expect(dd?.peak.toNumber()).toBe(1120);
    expect(dd?.trough.toNumber()).toBe(1000);
    expect(maxDrawdown(['10', '20'])).toBeNull();
  });
});
