import Decimal from 'decimal.js';

/** Tracker spec §6 — risk per trade, resolved in this order; each trade stores which method won. */
export type RiskSource = 'journal_sl' | 'journal_usd' | 'full_stop_loss' | 'estimated';

export type RiskInput = {
  side: 'buy' | 'sell';
  openPrice: string;
  lots: string;
  netProfit: string;
  slFinal: string | null;
  reasonCode: number | null;
  journal: { initialSl: string | null; plannedRiskUsd: string | null } | null;
  /** Risk tagged from the risk queue (trade_risk) without a journal entry; same weight as planned risk $. */
  taggedRiskUsd?: string | null;
  /** From symbol_specs; null when the symbol isn't verified yet. */
  pointValuePerLot: string | null;
};

export type RiskContext = {
  /** reason_code values that mean "closed by stop loss". Empty until verified from data (§6 step 3). */
  stopLossReasonCodes: ReadonlySet<number>;
  /** Median of this account's full_stop_loss risks over the trailing 30 days, if any. */
  trailingFullStopMedian: string | null;
  startingBalance: string;
  defaultRiskPct: string;
};

export function resolveRisk(t: RiskInput, ctx: RiskContext): { riskUsd: string; source: RiskSource } {
  if (t.journal?.initialSl && t.pointValuePerLot) {
    const risk = new Decimal(t.openPrice).minus(t.journal.initialSl).abs().times(t.lots).times(t.pointValuePerLot);
    if (risk.gt(0)) return { riskUsd: risk.toFixed(2), source: 'journal_sl' };
  }
  if (t.journal?.plannedRiskUsd && new Decimal(t.journal.plannedRiskUsd).gt(0)) {
    return { riskUsd: new Decimal(t.journal.plannedRiskUsd).toFixed(2), source: 'journal_usd' };
  }
  if (t.taggedRiskUsd && new Decimal(t.taggedRiskUsd).gt(0)) {
    return { riskUsd: new Decimal(t.taggedRiskUsd).toFixed(2), source: 'journal_usd' };
  }
  if (isFullStopLoss(t, ctx)) {
    return { riskUsd: new Decimal(t.netProfit).abs().toFixed(2), source: 'full_stop_loss' };
  }
  const fallback = new Decimal(ctx.startingBalance).times(ctx.defaultRiskPct).div(100);
  const estimate = ctx.trailingFullStopMedian ? new Decimal(ctx.trailingFullStopMedian) : fallback;
  return { riskUsd: estimate.toFixed(2), source: 'estimated' };
}

/** A losing trade closed by SL whose final stop was not moved into profit. */
export function isFullStopLoss(t: RiskInput, ctx: Pick<RiskContext, 'stopLossReasonCodes'>): boolean {
  if (t.reasonCode === null || !ctx.stopLossReasonCodes.has(t.reasonCode)) return false;
  if (!new Decimal(t.netProfit).lt(0)) return false;
  if (!t.slFinal) return false;
  const sl = new Decimal(t.slFinal);
  const entry = new Decimal(t.openPrice);
  return t.side === 'buy' ? sl.lt(entry) : sl.gt(entry);
}

export function median(values: Decimal.Value[]): string | null {
  if (values.length === 0) return null;
  const sorted = values.map((v) => new Decimal(v)).sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 ? sorted[mid] : sorted[mid - 1]?.plus(sorted[mid] ?? 0).div(2);
  return m ? m.toFixed(2) : null;
}

/** Risk in dollars for "I risked pct% on this trade": FundedNext measures risk against the starting balance. */
export function riskUsdFromPct(startingBalance: Decimal.Value, pct: Decimal.Value): string {
  return new Decimal(startingBalance).times(pct).div(100).toFixed(2);
}

/** The reverse, for showing a dollar risk as a % chip; null when the balance is unknown or zero. */
export function riskPctOf(riskUsd: Decimal.Value, startingBalance: Decimal.Value): string | null {
  const balance = new Decimal(startingBalance);
  if (balance.lte(0)) return null;
  return new Decimal(riskUsd).div(balance).times(100).toDecimalPlaces(2).toString();
}
