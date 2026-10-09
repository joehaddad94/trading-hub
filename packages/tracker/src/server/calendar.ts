import {
  buildMonth,
  type CalendarTrade,
  type DayBoundary,
  type DayStats,
  DEFAULT_DAY_BOUNDARY,
  dayRange,
  dayStats,
  type MonthCalendar,
  monthRange,
  type RuleUsage,
  ruleUsage,
  sumMoney,
  tradingDay,
} from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, desc, eq, gte, inArray, lt, sql } from '@trading/db/orm';
import {
  accountStatusHistory,
  accounts,
  balanceSnapshots,
  dailyNotes,
  journalEntries,
  ruleSnapshots,
  trades,
} from '@trading/db/schema';
import type { ResolvedScope, ScopeAccount } from './scope';

/** A trade with everything the day view lists (§8.2). */
export type DayTrade = CalendarTrade & {
  ticket: string;
  openPrice: string;
  closePrice: string;
  slFinal: string | null;
  tpFinal: string | null;
  firmRr: string | null;
  riskSource: 'journal_sl' | 'journal_usd' | 'full_stop_loss' | 'estimated' | null;
  tags: string[];
};

export type StatusEvent = {
  accountId: string;
  login: number;
  status: string;
  reason: string | null;
  at: Date;
  day: string;
};

const tagNames = sql<string[]>`coalesce((
  select array_agg(tg.name order by tg.name) from trade_tags tt join tags tg on tg.id = tt.tag_id
  where tt.trade_id = "trades"."id"
), '{}')`;

async function loadTrades(db: Executor, scope: ResolvedScope, from: Date, to: Date): Promise<DayTrade[]> {
  if (scope.accountIds.length === 0) return [];
  const rows = await db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      ticket: trades.ticket,
      symbol: trades.symbol,
      side: trades.side,
      lots: trades.lots,
      openedAt: trades.openedAt,
      closedAt: trades.closedAt,
      openPrice: trades.openPrice,
      closePrice: trades.closePrice,
      slFinal: trades.slFinal,
      tpFinal: trades.tpFinal,
      netProfit: trades.netProfit,
      commission: trades.commission,
      swap: trades.swap,
      riskUsd: trades.riskUsd,
      riskSource: trades.riskSource,
      firmRr: trades.firmRr,
      isNews: trades.isNews,
      journalId: journalEntries.id,
      followedPlan: journalEntries.followedPlan,
      tags: tagNames,
    })
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(
      and(
        inArray(trades.accountId, scope.accountIds),
        eq(trades.source, scope.source),
        gte(trades.closedAt, from),
        lt(trades.closedAt, to),
      ),
    )
    .orderBy(asc(trades.closedAt), asc(trades.ticket));
  return rows.map(({ journalId, ...t }) => ({ ...t, journaled: journalId !== null }));
}

async function loadStatusEvents(
  db: Executor,
  accountIds: string[],
  from: Date,
  to: Date,
  boundary: DayBoundary,
): Promise<StatusEvent[]> {
  if (accountIds.length === 0) return [];
  const rows = await db
    .select({
      accountId: accountStatusHistory.accountId,
      login: accounts.login,
      status: accountStatusHistory.status,
      reason: accountStatusHistory.statusReason,
      at: accountStatusHistory.changedAt,
    })
    .from(accountStatusHistory)
    .innerJoin(accounts, eq(accounts.id, accountStatusHistory.accountId))
    .where(
      and(
        inArray(accountStatusHistory.accountId, accountIds),
        gte(accountStatusHistory.changedAt, from),
        lt(accountStatusHistory.changedAt, to),
      ),
    )
    .orderBy(asc(accountStatusHistory.changedAt));
  // The same change can arrive from the firm's history and from import detection: keep one per account/status/day.
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const day = tradingDay(r.at, boundary);
    const key = `${r.accountId}|${r.status}|${day}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...r, day }];
  });
}

type RuleContext = {
  account: Pick<ScopeAccount, 'id' | 'startingBalance'>;
  snapshot: { at: Date; balance: string } | null;
  dailyLossPct: string | null;
  maxLossPct: string | null;
  trades: { closedAt: Date; netProfit: string }[];
};

async function loadRuleContexts(db: Executor, scope: ResolvedScope, accountIds: string[]): Promise<RuleContext[]> {
  if (accountIds.length === 0 || scope.source !== 'live') return [];
  const contexts: RuleContext[] = [];
  for (const id of accountIds) {
    const account = scope.accounts.find((a) => a.id === id);
    if (!account) continue;
    const [snap] = await db
      .select({ at: balanceSnapshots.takenAt, balance: balanceSnapshots.balance })
      .from(balanceSnapshots)
      .where(eq(balanceSnapshots.accountId, id))
      .orderBy(desc(balanceSnapshots.takenAt))
      .limit(1);
    const [rules] = await db
      .select({ daily: ruleSnapshots.dailyLossLimit, max: ruleSnapshots.maxLossLimit })
      .from(ruleSnapshots)
      .where(eq(ruleSnapshots.accountId, id))
      .orderBy(desc(ruleSnapshots.takenAt))
      .limit(1);
    const all = await db
      .select({ closedAt: trades.closedAt, netProfit: trades.netProfit })
      .from(trades)
      .where(and(eq(trades.accountId, id), eq(trades.source, 'live')));
    contexts.push({
      account,
      snapshot: snap ?? null,
      dailyLossPct: rules?.daily ?? null,
      maxLossPct: rules?.max ?? null,
      trades: all,
    });
  }
  return contexts;
}

function ruleUsageForDay(ctx: RuleContext, date: string, boundary: DayBoundary): RuleUsage {
  const { start, end } = dayRange(date, boundary);
  return ruleUsage({
    startingBalance: ctx.account.startingBalance,
    snapshot: ctx.snapshot,
    trades: ctx.trades,
    dayStart: start,
    dayEnd: end,
    dailyLossPct: ctx.dailyLossPct,
    maxLossPct: ctx.maxLossPct,
  });
}

export type CalendarMonthData = {
  calendar: MonthCalendar;
  statusEvents: StatusEvent[];
  /** Days with a rule-proximity warning on any account traded that day. */
  warningDays: string[];
  /** Sum of starting balances in scope, for the "% of balance" cell mode. */
  startingBalanceTotal: string;
};

/** The §8.2 month for a scope. */
export async function calendarMonth(
  db: Executor,
  scope: ResolvedScope,
  opts: { year: number; month: number; now: Date; boundary?: DayBoundary },
): Promise<CalendarMonthData> {
  const boundary = opts.boundary ?? DEFAULT_DAY_BOUNDARY;
  const range = monthRange(opts.year, opts.month, boundary);
  const monthTrades = await loadTrades(db, scope, range.start, range.end);
  const calendar = buildMonth({ year: opts.year, month: opts.month, trades: monthTrades, today: opts.now, boundary });
  const statusEvents = await loadStatusEvents(db, scope.accountIds, range.start, range.end, boundary);

  const traded = [...new Set(monthTrades.map((t) => t.accountId))];
  const contexts = await loadRuleContexts(db, scope, traded);
  const warningDays = new Set<string>();
  for (const week of calendar.weeks) {
    for (const day of week.days) {
      if (!day.stats) continue;
      for (const ctx of contexts) {
        if (day.stats.accountIds.includes(ctx.account.id) && ruleUsageForDay(ctx, day.date, boundary).warning) {
          warningDays.add(day.date);
        }
      }
    }
  }

  return {
    calendar,
    statusEvents,
    warningDays: [...warningDays],
    startingBalanceTotal: sumMoney(scope.accounts.map((a) => a.startingBalance)).toFixed(2),
  };
}

export type DayDetail = {
  date: string;
  stats: DayStats;
  trades: DayTrade[];
  rules: { accountId: string; usage: RuleUsage }[];
  statusEvents: StatusEvent[];
  note: { notes: string | null; mood: string | null; marketContext: string | null } | null;
};

/** Everything the §8.2 day view shows. */
export async function calendarDay(
  db: Executor,
  scope: ResolvedScope,
  date: string,
  boundary: DayBoundary = DEFAULT_DAY_BOUNDARY,
): Promise<DayDetail> {
  const { start, end } = dayRange(date, boundary);
  const dayTrades = await loadTrades(db, scope, start, end);
  const stats = dayStats(date, dayTrades);
  const contexts = await loadRuleContexts(db, scope, stats.accountIds);
  const [note] = await db
    .select({ notes: dailyNotes.notes, mood: dailyNotes.mood, marketContext: dailyNotes.marketContext })
    .from(dailyNotes)
    .where(eq(dailyNotes.date, date));
  return {
    date,
    stats,
    trades: dayTrades,
    rules: contexts.map((ctx) => ({ accountId: ctx.account.id, usage: ruleUsageForDay(ctx, date, boundary) })),
    statusEvents: await loadStatusEvents(db, scope.accountIds, start, end, boundary),
    note: note ?? null,
  };
}

/** Create or update the daily note (§8.2 day view). Empty fields are stored as null. */
export async function saveDailyNote(
  db: Executor,
  date: string,
  note: { notes: string | null; mood: string | null; marketContext: string | null },
) {
  await db
    .insert(dailyNotes)
    .values({ date, ...note })
    .onConflictDoUpdate({ target: dailyNotes.date, set: note });
}
