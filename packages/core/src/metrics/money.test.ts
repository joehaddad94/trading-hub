import { describe, expect, it } from 'vitest';
import { moneySummary } from './money';

const at = (d: string) => new Date(`${d}T12:00:00Z`);

describe('moneySummary', () => {
  it('nets payouts against fees, with refunds lowering fees', () => {
    const m = moneySummary([
      { kind: 'payout', amountUsd: '1200.50', occurredAt: at('2026-09-01') },
      { kind: 'challenge_fee', amountUsd: '-200', occurredAt: at('2026-07-01') },
      { kind: 'reset_fee', amountUsd: '-99.99', occurredAt: at('2026-08-01') },
      { kind: 'refund', amountUsd: '200', occurredAt: at('2026-09-10') },
    ]);
    expect(m.payouts.toFixed(2)).toBe('1200.50');
    expect(m.fees.toFixed(2)).toBe('99.99');
    expect(m.net.toFixed(2)).toBe('1100.51');
    expect(m.byKind.challenge_fee.toFixed(2)).toBe('-200.00');
    expect(m.timeline.map((t) => t.cumulative.toFixed(2))).toEqual(['-200.00', '-299.99', '900.51', '1100.51']);
  });

  it('is all zeros with no cashflows', () => {
    const m = moneySummary([]);
    expect([m.payouts, m.fees, m.net].map((d) => d.toFixed(2))).toEqual(['0.00', '0.00', '0.00']);
    expect(m.timeline).toEqual([]);
  });
});
