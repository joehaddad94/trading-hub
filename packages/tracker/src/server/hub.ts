import { type DayBoundary, DEFAULT_DAY_BOUNDARY, monthRange, sumMoney, tradingDay } from '@trading/core';
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
    hasData: scope.accountIds.length > 0,
  };
}
