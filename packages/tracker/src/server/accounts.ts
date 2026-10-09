import {
  biggestDeltas,
  type Drawdown,
  dayRange,
  maxDrawdown,
  type ProfileKey,
  type RuleUsage,
  ruleUsage,
  type TradeStats,
  type TradingProfile,
  tradeStats,
  tradingDay,
  tradingProfile,
} from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, desc, eq, sql } from '@trading/db/orm';
import {
  accountStatusHistory,
  accounts,
  balanceSnapshots,
  cycles,
  firms,
  ruleSnapshots,
  trades,
} from '@trading/db/schema';
import Decimal from 'decimal.js';
import type { TrackerSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';

type AccountRow = typeof accounts.$inferSelect;

export type AccountTradePoint = {
  closedAt: Date;
  openedAt: Date;
  netProfit: string;
  riskUsd: string | null;
  riskSource: (typeof trades.$inferSelect)['riskSource'];
  lots: string;
};

export type AccountSummary = {
  id: string;
  login: number;
  firm: string;
  phase: AccountRow['phase'];
  isDemo: boolean;
  status: AccountRow['status'];
  statusReason: string | null;
  platform: string | null;
  typeLabel: string | null;
  startingBalance: string;
  startedAt: Date;
  endedAt: Date | null;
  finalBalance: string | null;
  stats: TradeStats;
  /** Balance after each trade, starting at the starting balance (mini equity curve). */
  equity: { at: Date; balance: string }[];
  journeyRootLogin: number;
  journeyDepth: number;
};

const journeyRoot = sql<number>`(
  select root.login from account_journeys j join accounts root on root.id = j.root_account_id
  where j.account_id = "accounts"."id"
)`.mapWith(Number);
const journeyDepth = sql<number>`(select j.depth from account_journeys j where j.account_id = "accounts"."id")`.mapWith(
  Number,
);
const latestBalance = sql<string | null>`(
  select b.balance from balance_snapshots b where b.account_id = "accounts"."id" order by b.taken_at desc limit 1
)`;

async function accountTrades(db: Executor, accountId: string): Promise<AccountTradePoint[]> {
  return db
    .select({
      closedAt: trades.closedAt,
      openedAt: trades.openedAt,
      netProfit: trades.netProfit,
      riskUsd: trades.riskUsd,
      riskSource: trades.riskSource,
      lots: trades.lots,
    })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.source, 'live')))
    .orderBy(asc(trades.closedAt), asc(trades.ticket));
}

function equityOf(startingBalance: string, points: AccountTradePoint[]) {
  let balance = new Decimal(startingBalance);
  return points.map((p) => {
    balance = balance.plus(p.netProfit);
    return { at: p.closedAt, balance: balance.toFixed(2) };
  });
}

/** Accounts screen (§8.3 screen 2, §5.1): every account ever, with what the list shows. */
export async function listAccounts(
  db: Executor,
  settings: TrackerSettings = DEFAULT_SETTINGS,
): Promise<AccountSummary[]> {
  const rows = await db
    .select({
      account: accounts,
      firm: firms.name,
      journeyRootLogin: journeyRoot,
      journeyDepth: journeyDepth,
      finalBalance: latestBalance,
    })
    .from(accounts)
    .innerJoin(firms, eq(firms.id, accounts.firmId))
    .orderBy(asc(accounts.firstSeenAt), asc(accounts.login));
  const out: AccountSummary[] = [];
  for (const r of rows) {
    const a = r.account;
    const points = await accountTrades(db, a.id);
    out.push({
      id: a.id,
      login: a.login,
      firm: r.firm,
      phase: a.phase,
      isDemo: a.isDemo,
      status: a.status,
      statusReason: a.statusReason,
      platform: a.platform,
      typeLabel: a.typeLabel,
      startingBalance: a.startingBalance,
      startedAt: points[0] && points[0].openedAt < a.firstSeenAt ? points[0].openedAt : a.firstSeenAt,
      endedAt: a.status === 'active' ? null : (a.closedAt ?? a.statusChangedAt ?? points.at(-1)?.closedAt ?? null),
      finalBalance: r.finalBalance === null ? null : new Decimal(r.finalBalance).toFixed(2),
      stats: tradeStats(points, settings.scratchThresholdR),
      equity: equityOf(a.startingBalance, points),
      journeyRootLogin: r.journeyRootLogin || a.login,
      journeyDepth: r.journeyDepth || 0,
    });
  }
  return out;
}

/** Accounts grouped by journey (P1 → P2 → Funded), newest journey first, chain in order. */
export function groupJourneys(list: AccountSummary[]): { rootLogin: number; accounts: AccountSummary[] }[] {
  const groups = new Map<number, AccountSummary[]>();
  for (const a of list) groups.set(a.journeyRootLogin, [...(groups.get(a.journeyRootLogin) ?? []), a]);
  return [...groups.entries()]
    .map(([rootLogin, chain]) => ({ rootLogin, accounts: chain.sort((x, y) => x.journeyDepth - y.journeyDepth) }))
    .sort((x, y) => {
      const last = (g: AccountSummary[]) => Math.max(...g.map((a) => a.startedAt.getTime()));
      return last(y.accounts) - last(x.accounts);
    });
}

export type TimelineEntry = { at: Date; status: string; reason: string | null; label: string };

export type AccountDetail = AccountSummary & {
  currentCycle: { startedAt: Date | null; endsAt: Date | null } | null;
  maxDrawdown: Drawdown;
  rules: {
    dailyLossPct: string | null;
    maxLossPct: string | null;
    profitTargetPct: string | null;
    /** When the export these limits came from was generated (limits come from data, never hard-coded). */
    takenAt: Date;
    /** Usage on the last trading day (or today when nothing traded yet). */
    lastDay: string;
    usage: RuleUsage;
  } | null;
  timeline: TimelineEntry[];
};

/** Account detail (§8.3 screen 3). Null when no account has this login. */
export async function accountDetail(
  db: Executor,
  login: number,
  now: Date,
  settings: TrackerSettings = DEFAULT_SETTINGS,
): Promise<AccountDetail | null> {
  const list = await listAccounts(db, settings);
  const summary = list.find((a) => a.login === login);
  if (!summary) return null;

  const [cycle] = await db
    .select({ startedAt: cycles.startedAt, endsAt: cycles.endsAt })
    .from(cycles)
    .where(eq(cycles.accountId, summary.id))
    .orderBy(desc(cycles.startedAt))
    .limit(1);
  const [rules] = await db
    .select({
      daily: ruleSnapshots.dailyLossLimit,
      max: ruleSnapshots.maxLossLimit,
      target: ruleSnapshots.profitTarget,
      takenAt: ruleSnapshots.takenAt,
    })
    .from(ruleSnapshots)
    .where(eq(ruleSnapshots.accountId, summary.id))
    .orderBy(desc(ruleSnapshots.takenAt))
    .limit(1);
  const [snap] = await db
    .select({ at: balanceSnapshots.takenAt, balance: balanceSnapshots.balance })
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.accountId, summary.id))
    .orderBy(desc(balanceSnapshots.takenAt))
    .limit(1);
  const points = await accountTrades(db, summary.id);
  const history = await db
    .select({
      at: accountStatusHistory.changedAt,
      status: accountStatusHistory.status,
      reason: accountStatusHistory.statusReason,
    })
    .from(accountStatusHistory)
    .where(eq(accountStatusHistory.accountId, summary.id))
    .orderBy(asc(accountStatusHistory.changedAt));

  const lastDay = tradingDay(points.at(-1)?.closedAt ?? now, settings.boundary);
  const { start, end } = dayRange(lastDay, settings.boundary);
  const usage = rules
    ? ruleUsage({
        startingBalance: summary.startingBalance,
        snapshot: snap ?? null,
        trades: points,
        dayStart: start,
        dayEnd: end,
        dailyLossPct: rules.daily,
        maxLossPct: rules.max,
      })
    : null;

  return {
    ...summary,
    currentCycle: cycle ?? null,
    maxDrawdown: maxDrawdown(
      points.map((p) => p.netProfit),
      summary.startingBalance,
    ),
    rules:
      rules && usage
        ? {
            dailyLossPct: rules.daily,
            maxLossPct: rules.max,
            profitTargetPct: rules.target,
            takenAt: rules.takenAt,
            lastDay,
            usage,
          }
        : null,
    timeline: lifecycle(summary, history),
  };
}

const PHASE_NAMES: Record<string, string> = {
  p1: 'Phase 1',
  p2: 'Phase 2',
  funded: 'Funded',
  instant: 'Instant',
  other: 'Account',
};

/** Lifecycle timeline (§5.1): created, then each status change, de-duplicated by status and day. */
export function lifecycle(
  a: Pick<AccountSummary, 'startedAt' | 'phase'>,
  history: { at: Date; status: string; reason: string | null }[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { at: a.startedAt, status: 'created', reason: null, label: `${PHASE_NAMES[a.phase] ?? 'Account'} started` },
  ];
  let previous = 'active';
  for (const h of history) {
    if (h.status === previous) continue;
    previous = h.status;
    entries.push({ at: h.at, status: h.status, reason: h.reason, label: h.status.replace(/_/g, ' ') });
  }
  return entries;
}

export type PhaseComparison = {
  groups: { key: string; label: string; accounts: number; profile: TradingProfile }[];
  demo: TradingProfile;
  funded: TradingProfile;
  deltas: { key: ProfileKey; delta: Decimal }[];
};

/** Demo vs Funded (§8.3 screen 4): the same metrics per phase, and the biggest demo → funded differences. */
export async function phaseComparison(
  db: Executor,
  settings: TrackerSettings = DEFAULT_SETTINGS,
): Promise<PhaseComparison> {
  const list = await db.select({ id: accounts.id, phase: accounts.phase, isDemo: accounts.isDemo }).from(accounts);
  const opts = { boundary: settings.boundary, scratchThresholdR: settings.scratchThresholdR };
  const byPhase = new Map<string, { accounts: number; trades: AccountTradePoint[] }>();
  const demo: AccountTradePoint[] = [];
  const funded: AccountTradePoint[] = [];
  for (const a of list) {
    const points = await accountTrades(db, a.id);
    const g = byPhase.get(a.phase) ?? { accounts: 0, trades: [] };
    byPhase.set(a.phase, { accounts: g.accounts + 1, trades: [...g.trades, ...points] });
    (a.isDemo ? demo : funded).push(...points);
  }
  const order = ['p1', 'p2', 'funded', 'instant', 'other'];
  const demoProfile = tradingProfile(demo, opts);
  const fundedProfile = tradingProfile(funded, opts);
  return {
    groups: [...byPhase.entries()]
      .sort(([x], [y]) => order.indexOf(x) - order.indexOf(y))
      .map(([key, g]) => ({
        key,
        label: PHASE_NAMES[key] ?? key,
        accounts: g.accounts,
        profile: tradingProfile(g.trades, opts),
      })),
    demo: demoProfile,
    funded: fundedProfile,
    deltas: biggestDeltas(demoProfile, fundedProfile),
  };
}
