import {
  type DayBoundary,
  DEFAULT_DAY_BOUNDARY,
  mondayOf,
  monthRange,
  sumMoney,
  tradeStats,
  tradingDay,
} from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, desc, eq, isNull, sql } from '@trading/db/orm';
import { accounts, balanceSnapshots, journalEntries, trades } from '@trading/db/schema';
import Decimal from 'decimal.js';
import { resolveScope } from './scope';
import { scopedTrades } from './trades';

export type TrackerHubSummary = {
  monthLabel: string;
  monthNet: string;
  greenDays: number;
  tradingDays: number;
  awaitingJournal: number;
  activeAccounts: { login: number; phase: string; balance: string | null }[];
  /** Today's closed trades (trading day by the day boundary). */
  today: { net: string; trades: number };
  /** Monday to now: net, trade count and win rate (from core metrics). */
  week: { net: string; trades: number; winRate: string | null };
  /** Cumulative net after each trade this month, starting at 0 — the hub's small curve. */
  monthCurve: string[];
  /** Latest closed live trades, newest first. */
  recent: { id: string; login: number; symbol: string; side: string; closedAt: Date; netProfit: string }[];
  hasData: boolean;
};

/** Tracker card on the hub (§8.0): current month, all live accounts. */
export async function trackerHubSummary(
  db: Executor,
  now = new Date(),
  boundary: DayBoundary = DEFAULT_DAY_BOUNDARY,
): Promise<TrackerHubSummary> {
  const scope = await resolveScope(db, { kind: 'all' });
  const day = tradingDay(now, boundary);
  const [year, month] = day.split('-').map(Number) as [number, number];
  const range = monthRange(year, month, boundary);
  const monthTrades = await scopedTrades(db, scope, { from: range.start, to: range.end });
  // The week can start in the previous month: read from 8 days before whichever starts first.
  const weekStart = mondayOf(day);
  const lookback = new Date(Math.min(range.start.getTime(), now.getTime() - 8 * 86_400_000));
  const recentTrades = await scopedTrades(db, scope, { from: lookback });
  const weekTrades = recentTrades.filter((t) => tradingDay(t.closedAt, boundary) >= weekStart);
  const todayTrades = recentTrades.filter((t) => tradingDay(t.closedAt, boundary) === day);
  const weekStats = tradeStats(weekTrades);
  const monthCurve = ['0.00'];
  let running = new Decimal(0);
  for (const t of monthTrades) {
    running = running.plus(t.netProfit);
    monthCurve.push(running.toFixed(2));
  }
  const loginOf = new Map(scope.accounts.map((a) => [a.id, a.login]));

  const byDay = new Map<string, string[]>();
  for (const t of monthTrades) {
    const key = tradingDay(t.closedAt, boundary);
    byDay.set(key, [...(byDay.get(key) ?? []), t.netProfit]);
  }
  const dayTotals = [...byDay.values()].map((nets) => sumMoney(nets));

  const [awaiting] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(and(eq(trades.source, 'live'), isNull(journalEntries.id)));

  const latestBalance = sql<string | null>`(
    select ${balanceSnapshots.balance} from ${balanceSnapshots}
    where ${balanceSnapshots.accountId} = "accounts"."id"
    order by ${balanceSnapshots.takenAt} desc limit 1
  )`;
  const active = await db
    .select({ login: accounts.login, phase: accounts.phase, balance: latestBalance })
    .from(accounts)
    .where(and(eq(accounts.status, 'active'), eq(accounts.isBacktest, false)))
    .orderBy(asc(accounts.isDemo), desc(accounts.lastSeenAt));

  return {
    monthLabel: new Date(Date.UTC(year, month - 1, 15)).toLocaleString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    monthNet: sumMoney(monthTrades.map((t) => t.netProfit)).toFixed(2),
    greenDays: dayTotals.filter((d) => new Decimal(d).gt(0)).length,
    tradingDays: dayTotals.length,
    awaitingJournal: awaiting?.n ?? 0,
    activeAccounts: active.map((a) => ({
      ...a,
      balance: a.balance === null ? null : new Decimal(a.balance).toFixed(2),
    })),
    today: { net: sumMoney(todayTrades.map((t) => t.netProfit)).toFixed(2), trades: todayTrades.length },
    week: {
      net: weekStats.net.toFixed(2),
      trades: weekStats.trades,
      winRate: weekStats.winRate === null ? null : weekStats.winRate.toFixed(4),
    },
    monthCurve,
    recent: recentTrades
      .slice(-5)
      .reverse()
      .map((t) => ({
        id: t.id,
        login: loginOf.get(t.accountId) ?? 0,
        symbol: t.symbol,
        side: t.side,
        closedAt: t.closedAt,
        netProfit: new Decimal(t.netProfit).toFixed(2),
      })),
    hasData: scope.accountIds.length > 0,
  };
}
