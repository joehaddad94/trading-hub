import Decimal from 'decimal.js';

/** Tracker spec §8.2 day view "Risk/rules", and §6 rule proximity. Based on closed trades and daily snapshots. */
export type RuleUsageInput = {
  startingBalance: string;
  /** Latest known balance and when it was taken; null → balance is rebuilt from the starting balance. */
  snapshot: { at: Date; balance: string } | null;
  /** Every closed live trade of the account (any order). */
  trades: { closedAt: Date; netProfit: string }[];
  dayStart: Date;
  dayEnd: Date;
  /** Limits as % of starting balance, as the firm reports them (e.g. 5 and 10). */
  dailyLossPct: string | null;
  maxLossPct: string | null;
};

export type RuleUsage = {
  startBalance: Decimal;
  endBalance: Decimal;
  /** Largest fall below the start-of-day balance during the day (closed trades only). */
  dailyLossUsed: Decimal;
  dailyLossLimit: Decimal | null;
  /** 0–1+ share of the daily limit used. */
  dailyLossUsedShare: Decimal | null;
  maxLossFloor: Decimal | null;
  distanceToMaxLoss: Decimal | null;
  /** ≥ 80% of the daily limit used, or within 20% of the max-loss amount. */
  warning: boolean;
};

export const RULE_WARNING_SHARE = new Decimal('0.8');

/** Balance at instant `at`, rebuilt from the snapshot (or the starting balance) and closed trades. */
export function balanceAt(input: Pick<RuleUsageInput, 'startingBalance' | 'snapshot' | 'trades'>, at: Date): Decimal {
  const { snapshot, trades } = input;
  if (!snapshot) {
    return trades
      .filter((t) => t.closedAt <= at)
      .reduce((b, t) => b.plus(t.netProfit), new Decimal(input.startingBalance));
  }
  let balance = new Decimal(snapshot.balance);
  for (const t of trades) {
    if (t.closedAt > at && t.closedAt <= snapshot.at) balance = balance.minus(t.netProfit);
    if (t.closedAt <= at && t.closedAt > snapshot.at) balance = balance.plus(t.netProfit);
  }
  return balance;
}

export function ruleUsage(input: RuleUsageInput): RuleUsage {
  const startBalance = balanceAt(input, new Date(input.dayStart.getTime() - 1));
  const dayTrades = input.trades
    .filter((t) => t.closedAt >= input.dayStart && t.closedAt < input.dayEnd)
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  let running = startBalance;
  let lowest = startBalance;
  for (const t of dayTrades) {
    running = running.plus(t.netProfit);
    if (running.lt(lowest)) lowest = running;
  }
  const starting = new Decimal(input.startingBalance);
  const dailyLossLimit = input.dailyLossPct ? starting.times(input.dailyLossPct).div(100) : null;
  const maxLossAmount = input.maxLossPct ? starting.times(input.maxLossPct).div(100) : null;
  const maxLossFloor = maxLossAmount ? starting.minus(maxLossAmount) : null;
  const dailyLossUsed = startBalance.minus(lowest);
  const dailyLossUsedShare = dailyLossLimit?.gt(0) ? dailyLossUsed.div(dailyLossLimit) : null;
  const distanceToMaxLoss = maxLossFloor ? running.minus(maxLossFloor) : null;
  const warning =
    (dailyLossUsedShare?.gte(RULE_WARNING_SHARE) ?? false) ||
    (distanceToMaxLoss && maxLossAmount
      ? distanceToMaxLoss.lte(maxLossAmount.times(new Decimal(1).minus(RULE_WARNING_SHARE)))
      : false);
  return {
    startBalance,
    endBalance: running,
    dailyLossUsed,
    dailyLossLimit,
    dailyLossUsedShare,
    maxLossFloor,
    distanceToMaxLoss,
    warning,
  };
}
