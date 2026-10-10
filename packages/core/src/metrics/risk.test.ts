import { describe, expect, it } from 'vitest';
import { isFullStopLoss, median, type RiskContext, type RiskInput, resolveRisk } from './risk';

const base: RiskInput = {
  side: 'buy',
  openPrice: '20000',
  lots: '0.50',
  netProfit: '-150.00',
  slFinal: '19970',
  reasonCode: 4,
  journal: null,
  pointValuePerLot: '10',
};
const ctx: RiskContext = {
  stopLossReasonCodes: new Set([4]),
  trailingFullStopMedian: null,
  startingBalance: '25000',
  defaultRiskPct: '0.5',
};

describe('resolveRisk order (§6)', () => {
  it('1. journal initial SL wins', () => {
    const r = resolveRisk({ ...base, journal: { initialSl: '19960', plannedRiskUsd: '90' } }, ctx);
    expect(r).toEqual({ riskUsd: '200.00', source: 'journal_sl' });
  });

  it('2. journal USD when SL missing or no point value', () => {
    expect(resolveRisk({ ...base, journal: { initialSl: null, plannedRiskUsd: '90' } }, ctx).source).toBe(
      'journal_usd',
    );
    expect(
      resolveRisk({ ...base, pointValuePerLot: null, journal: { initialSl: '19960', plannedRiskUsd: '90' } }, ctx),
    ).toEqual({ riskUsd: '90.00', source: 'journal_usd' });
  });

  it('3. full stop loss uses |net loss|', () => {
    expect(resolveRisk(base, ctx)).toEqual({ riskUsd: '150.00', source: 'full_stop_loss' });
  });

  it('4. estimated: trailing median, else % of starting balance', () => {
    const winner = { ...base, netProfit: '80.00' };
    expect(resolveRisk(winner, ctx)).toEqual({ riskUsd: '125.00', source: 'estimated' });
    expect(resolveRisk(winner, { ...ctx, trailingFullStopMedian: '140' })).toEqual({
      riskUsd: '140.00',
      source: 'estimated',
    });
  });
});

describe('isFullStopLoss', () => {
  it('needs a verified SL reason code', () => {
    expect(isFullStopLoss(base, { stopLossReasonCodes: new Set() })).toBe(false);
    expect(isFullStopLoss({ ...base, reasonCode: null }, ctx)).toBe(false);
  });

  it('rejects stops moved into profit, per side', () => {
    expect(isFullStopLoss({ ...base, slFinal: '20010' }, ctx)).toBe(false);
    expect(isFullStopLoss({ ...base, side: 'sell', slFinal: '20030' }, ctx)).toBe(true);
    expect(isFullStopLoss({ ...base, side: 'sell', slFinal: '19990' }, ctx)).toBe(false);
    expect(isFullStopLoss({ ...base, slFinal: null }, ctx)).toBe(false);
    expect(isFullStopLoss({ ...base, netProfit: '10' }, ctx)).toBe(false);
  });
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median(['3', '1', '2'])).toBe('2.00');
    expect(median(['4', '1', '2', '3'])).toBe('2.50');
    expect(median([])).toBeNull();
  });
});
