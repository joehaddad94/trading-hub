import Decimal from 'decimal.js';

/**
 * The single definition of every number shown to Joe (CLAUDE.md rule 8, tracker spec §6).
 * Inputs are decimal strings straight from Postgres `numeric`; outputs are Decimals or null when undefined.
 */

export type MetricTrade = {
  /** profit + commission + swap */
  netProfit: string;
  /** Resolved risk in USD (§6); null when unknown → R metrics skip the trade. */
  riskUsd: string | null;
  /** How the risk was resolved. An `estimated` risk feeds R metrics but never makes a trade a scratch. */
  riskSource?: 'journal_sl' | 'journal_usd' | 'full_stop_loss' | 'estimated' | null;
};

export const DEFAULT_SCRATCH_THRESHOLD_R = 0.1;

export function rMultiple(netProfit: Decimal.Value, riskUsd: Decimal.Value | null): Decimal | null {
  if (riskUsd === null) return null;
  const risk = new Decimal(riskUsd);
  if (risk.lte(0)) return null;
  return new Decimal(netProfit).div(risk);
}

export type Outcome = 'win' | 'loss' | 'scratch';

/**
 * Win = net > 0; scratch = |R| < threshold, reported separately and never as a win. Only a known risk can make
 * a trade a scratch: with a guessed risk, small wins would vanish from the win rate (so it would no longer
 * match FundedNext's).
 */
export function classify(trade: MetricTrade, scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R): Outcome {
  const r = trade.riskSource === 'estimated' ? null : rMultiple(trade.netProfit, trade.riskUsd);
  const net = new Decimal(trade.netProfit);
  if (r?.abs().lt(scratchThresholdR) || net.isZero()) return 'scratch';
  return net.gt(0) ? 'win' : 'loss';
}

export type TradeStats = {
  trades: number;
  wins: number;
  losses: number;
  scratches: number;
  /** wins / all trades — matches FundedNext's definition (scratches count, but never as wins). */
  winRate: Decimal | null;
  net: Decimal;
  grossProfit: Decimal;
  /** Positive number. */
  grossLoss: Decimal;
  profitFactor: Decimal | null;
  avgWin: Decimal | null;
  avgLoss: Decimal | null;
  /** Trades with a known R. */
  rTrades: number;
  netR: Decimal | null;
  avgWinR: Decimal | null;
  avgLossR: Decimal | null;
  expectancyR: Decimal | null;
  /** 1 / (1 + avgWinR): the win rate needed to break even at the current payoff (losses at −1R). */
  breakevenWinRate: Decimal | null;
};

const avg = (xs: Decimal[]) => (xs.length ? Decimal.sum(...xs).div(xs.length) : null);

export function tradeStats(trades: MetricTrade[], scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R): TradeStats {
  const wins: Decimal[] = [];
  const losses: Decimal[] = [];
  const winRs: Decimal[] = [];
  const lossRs: Decimal[] = [];
  const allRs: Decimal[] = [];
  let scratches = 0;
  let net = new Decimal(0);

  for (const t of trades) {
    const value = new Decimal(t.netProfit);
    net = net.plus(value);
    const r = rMultiple(t.netProfit, t.riskUsd);
    if (r) allRs.push(r);
    const outcome = classify(t, scratchThresholdR);
    if (outcome === 'scratch') scratches += 1;
    if (outcome === 'win') {
      wins.push(value);
      if (r) winRs.push(r);
    }
    if (outcome === 'loss') {
      losses.push(value);
      if (r) lossRs.push(r);
    }
  }

  const grossProfit = wins.length ? Decimal.sum(...wins) : new Decimal(0);
  const grossLoss = losses.length ? Decimal.sum(...losses).abs() : new Decimal(0);
  const avgWinR = avg(winRs);
  const avgLossR = avg(lossRs);
  const winRate = trades.length ? new Decimal(wins.length).div(trades.length) : null;

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    scratches,
    winRate,
    net,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss.isZero() ? null : grossProfit.div(grossLoss),
    avgWin: avg(wins),
    avgLoss: avg(losses),
    rTrades: allRs.length,
    netR: allRs.length ? Decimal.sum(...allRs) : null,
    avgWinR,
    avgLossR,
    expectancyR: avg(allRs),
    breakevenWinRate: breakevenWinRate(avgWinR),
  };
}

/** §6: breakeven win rate for a given average win in R = 1 / (1 + avgWinR). */
export function breakevenWinRate(avgWinR: Decimal | null): Decimal | null {
  if (!avgWinR || avgWinR.lte(0)) return null;
  return new Decimal(1).div(avgWinR.plus(1));
}

export type EquityPoint = { at: Date; equity: Decimal; accountId?: string };

/** Cumulative net P/L in close-time order, starting at 0 (combined equity curve, §6). */
export function equityCurve<T extends MetricTrade & { closedAt: Date; accountId?: string }>(
  trades: T[],
): EquityPoint[] {
  let equity = new Decimal(0);
  return [...trades]
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())
    .map((t) => {
      equity = equity.plus(t.netProfit);
      return { at: t.closedAt, equity, ...(t.accountId ? { accountId: t.accountId } : {}) };
    });
}

export type Drawdown = { amount: Decimal; peak: Decimal; trough: Decimal } | null;

/** Largest peak-to-trough fall of a running balance, starting from `start`. */
export function maxDrawdown(netChanges: Decimal.Value[], start: Decimal.Value = 0): Drawdown {
  let balance = new Decimal(start);
  let peak = balance;
  let worst: Drawdown = null;
  for (const change of netChanges) {
    balance = balance.plus(change);
    if (balance.gt(peak)) peak = balance;
    const dd = peak.minus(balance);
    if (dd.gt(0) && (!worst || dd.gt(worst.amount))) worst = { amount: dd, peak, trough: balance };
  }
  return worst;
}
