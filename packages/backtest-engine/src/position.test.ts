import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { defaultLevels, formatSpan, lotsFor, measure, positionMetrics } from './position';

describe('positionMetrics', () => {
  const base = { pointValue: '10', balance: '25000' } as const;

  it('sizes a long from risk % and reports RR, points and dollars', () => {
    const m = positionMetrics({
      ...base,
      side: 'long',
      entry: 46000.5,
      stop: 45975.5,
      target: 46050.5,
      sizing: { mode: 'risk_pct', value: '0.5' },
    });
    // 25 points × $10 = $250 per lot; 0.5% of 25k = $125 → 0.50 lots.
    expect(m).toEqual({
      valid: true,
      slPoints: '25.00',
      tpPoints: '50.00',
      rr: '2.00',
      lots: '0.50',
      riskUsd: '125.00',
      rewardUsd: '250.00',
      riskPct: '0.50',
    });
  });

  it('handles shorts, fixed lots and $ risk; flags a stop on the wrong side', () => {
    const short = positionMetrics({
      ...base,
      side: 'short',
      entry: 24000,
      stop: 24030,
      target: 23910,
      sizing: { mode: 'lots', value: '1.239' },
    });
    expect([short.valid, short.lots, short.riskUsd, short.rr]).toEqual([true, '1.23', '369.00', '3.00']);
    const usd = positionMetrics({
      ...base,
      side: 'short',
      entry: 24000,
      stop: 24030,
      target: 23910,
      sizing: { mode: 'risk_usd', value: '100' },
    });
    expect([usd.lots, usd.riskUsd]).toEqual(['0.33', '99.00']);
    const wrong = positionMetrics({
      ...base,
      side: 'long',
      entry: 100,
      stop: 110,
      target: 120,
      sizing: { mode: 'lots', value: '1' },
    });
    expect(wrong.valid).toBe(false);
    const flat = positionMetrics({
      ...base,
      balance: '0',
      side: 'long',
      entry: 100,
      stop: 100,
      target: 120,
      sizing: { mode: 'risk_pct', value: '1' },
    });
    expect([flat.lots, flat.rr, flat.riskPct]).toEqual(['0.00', '0.00', '0.00']);
  });

  it('rounds lots down to the 0.01 step', () => {
    expect(
      lotsFor({ mode: 'risk_usd', value: '100' }, new Decimal(7), new Decimal(10), new Decimal(0)).toFixed(2),
    ).toBe('1.42');
  });
});

describe('defaultLevels', () => {
  it('places the stop on the losing side and the target at 1:2', () => {
    expect(defaultLevels('long', 46000, 20)).toEqual({ stop: 45980, target: 46040 });
    expect(defaultLevels('short', 46000, 20, 3)).toEqual({ stop: 46020, target: 45940 });
  });
});

describe('measure', () => {
  it('reports change, percent, bars and span', () => {
    const a = { ts: Date.parse('2026-10-07T13:30:00Z'), price: 46000 };
    const b = { ts: Date.parse('2026-10-07T14:55:00Z'), price: 46115 };
    expect(measure(a, b, 17)).toEqual({ points: '115.00', pct: '0.25', bars: 17, ms: 85 * 60_000 });
    expect(measure({ ts: 0, price: 0 }, b, 1).pct).toBe('0.00');
    expect([formatSpan(85 * 60_000), formatSpan(15 * 60_000), formatSpan(-(51 * 3_600_000))]).toEqual([
      '1h 25m',
      '15m',
      '2d 3h',
    ]);
  });
});
