import { describe, expect, it } from 'vitest';
import { biggestDeltas, type ProfileTrade, tradingProfile } from './profile';

const t = (over: Partial<ProfileTrade>): ProfileTrade => ({
  netProfit: '100',
  riskUsd: '100',
  riskSource: 'journal_usd',
  openedAt: new Date('2026-10-05T13:40:00Z'),
  closedAt: new Date('2026-10-05T14:00:00Z'),
  lots: '1',
  ...over,
});

describe('tradingProfile', () => {
  it('summarises a group of trades', () => {
    const p = tradingProfile([
      t({}),
      t({
        netProfit: '-100',
        lots: '3',
        openedAt: new Date('2026-10-06T06:30:00Z'),
        closedAt: new Date('2026-10-06T07:30:00Z'),
      }),
    ]);
    expect(p.trades).toBe(2);
    expect(p.winRate?.toNumber()).toBe(0.5);
    expect(p.avgWinR?.toNumber()).toBe(1);
    expect(p.avgLossR?.toNumber()).toBe(-1);
    expect(p.tradesPerDay?.toNumber()).toBe(1);
    expect(p.avgHoldMs).toBe(40 * 60_000);
    expect(p.avgLots?.toNumber()).toBe(2);
    expect(p.sessionMix.ny_am.toNumber()).toBe(0.5);
    expect(p.sessionMix.london.toNumber()).toBe(0.5);
    expect(p.sessionMix.outside.toNumber()).toBe(0);
  });

  it('is empty without trades', () => {
    const p = tradingProfile([]);
    expect([p.winRate, p.tradesPerDay, p.avgHoldMs, p.avgLots]).toEqual([null, null, null, null]);
    expect(p.sessionMix.asia.toNumber()).toBe(0);
  });
});

describe('biggestDeltas', () => {
  it('ranks metrics by relative difference', () => {
    const demo = tradingProfile([t({}), t({ netProfit: '-100' })]);
    const funded = tradingProfile([t({ lots: '4', netProfit: '-100' }), t({ lots: '4', netProfit: '-50' })]);
    const deltas = biggestDeltas(demo, funded);
    expect(deltas[0]?.key).toBe('winRate');
    expect(deltas.map((d) => d.key)).toContain('avgLots');
    expect(deltas.find((d) => d.key === 'avgWinR')).toBeUndefined();
  });
});
