import Decimal from 'decimal.js';

export type CashflowKind = 'challenge_fee' | 'reset_fee' | 'addon' | 'payout' | 'refund' | 'other';

/** A money movement with the firm (tracker spec §5): fees negative, payouts positive. */
export type Cashflow = { kind: CashflowKind; amountUsd: string; occurredAt: Date };

export type MoneySummary = {
  payouts: Decimal;
  /** Everything that isn't a payout, as a positive cost (refunds reduce it). */
  fees: Decimal;
  /** Net prop result (§6): payouts − fees. */
  net: Decimal;
  byKind: Record<CashflowKind, Decimal>;
  /** Running net after each cashflow, oldest first. */
  timeline: { at: Date; kind: CashflowKind; amount: Decimal; cumulative: Decimal }[];
};

const KINDS: CashflowKind[] = ['challenge_fee', 'reset_fee', 'addon', 'payout', 'refund', 'other'];

/** Net prop result and its breakdown — the "am I actually making money" number (§6). */
export function moneySummary(rows: Cashflow[]): MoneySummary {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, new Decimal(0)])) as Record<CashflowKind, Decimal>;
  const sorted = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let running = new Decimal(0);
  const timeline = sorted.map((c) => {
    const amount = new Decimal(c.amountUsd);
    byKind[c.kind] = byKind[c.kind].plus(amount);
    running = running.plus(amount);
    return { at: c.occurredAt, kind: c.kind, amount, cumulative: running };
  });
  const payouts = byKind.payout;
  const net = running;
  return { payouts, fees: payouts.minus(net), net, byKind, timeline };
}
