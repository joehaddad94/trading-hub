import {
  activeRestrictions,
  type CalendarEvent,
  dayRange,
  hasNewsAddon,
  hideFutureActuals,
  mondayOf,
  NEWS_DAYS,
  type NewsImpact,
  nextEvent,
  restrictionApplies,
  tradingDay,
  weekDates,
  weekRange,
} from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, between, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from '@trading/db/orm';
import { accounts, appSettings, economicEvents, trades } from '@trading/db/schema';

export type NewsSettings = { minutesBefore: number; minutesAfter: number; currencies: string[] };

export const DEFAULT_NEWS_SETTINGS: NewsSettings = { minutesBefore: 5, minutesAfter: 5, currencies: ['USD'] };

export async function getNewsSettings(db: Executor): Promise<NewsSettings> {
  const [row] = await db
    .select({
      minutesBefore: appSettings.newsMinutesBefore,
      minutesAfter: appSettings.newsMinutesAfter,
      currencies: appSettings.newsCurrencies,
    })
    .from(appSettings)
    .limit(1);
  return row ?? DEFAULT_NEWS_SETTINGS;
}

export async function saveNewsSettings(db: Executor, s: NewsSettings) {
  await db
    .insert(appSettings)
    .values({
      id: true,
      newsMinutesBefore: s.minutesBefore,
      newsMinutesAfter: s.minutesAfter,
      newsCurrencies: s.currencies,
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { newsMinutesBefore: s.minutesBefore, newsMinutesAfter: s.minutesAfter, newsCurrencies: s.currencies },
    });
}

export type NewsEvent = CalendarEvent & { restrictionLabel: string | null };

const visible = and(isNull(economicEvents.supersededBy), isNull(economicEvents.cancelledAt));

const eventColumns = {
  id: economicEvents.id,
  title: economicEvents.title,
  currency: economicEvents.currency,
  impact: economicEvents.impact,
  eventAt: economicEvents.eventAt,
  forecast: economicEvents.forecast,
  previous: economicEvents.previous,
  isRestricted: economicEvents.isRestricted,
  restrictionLabel: economicEvents.restrictionLabel,
};

export type EventQuery = {
  from: Date;
  to: Date;
  impacts?: NewsImpact[] | undefined;
  currencies?: string[] | undefined;
  restrictedOnly?: boolean | undefined;
};

/** Visible events in [from, to), oldest first (duplicates and cancelled events hidden, news spec §1.3). */
export async function listEvents(db: Executor, q: EventQuery): Promise<NewsEvent[]> {
  return db
    .select(eventColumns)
    .from(economicEvents)
    .where(
      and(
        visible,
        gte(economicEvents.eventAt, q.from),
        lt(economicEvents.eventAt, q.to),
        q.impacts?.length ? inArray(economicEvents.impact, q.impacts) : undefined,
        q.currencies?.length ? inArray(economicEvents.currency, q.currencies) : undefined,
        q.restrictedOnly ? eq(economicEvents.isRestricted, true) : undefined,
      ),
    )
    .orderBy(asc(economicEvents.eventAt), asc(economicEvents.currency), asc(economicEvents.title));
}

/**
 * Events for the backtester chart (news spec §4): the same filters as the News page plus `actual`, which is
 * blanked for anything after `until` (the replay cursor) so a future release never leaks.
 */
export async function chartEvents(
  db: Executor,
  q: EventQuery,
  until: Date,
): Promise<(NewsEvent & { actual: string | null })[]> {
  const rows = await db
    .select({ ...eventColumns, actual: economicEvents.actual })
    .from(economicEvents)
    .where(
      and(
        visible,
        gte(economicEvents.eventAt, q.from),
        lt(economicEvents.eventAt, q.to),
        q.impacts?.length ? inArray(economicEvents.impact, q.impacts) : undefined,
        q.currencies?.length ? inArray(economicEvents.currency, q.currencies) : undefined,
      ),
    )
    .orderBy(asc(economicEvents.eventAt), asc(economicEvents.currency), asc(economicEvents.title));
  return hideFutureActuals(rows, until);
}

/** "Calendar last synced" (news spec §6): when the newest export that carried news was generated. */
export async function lastNewsSync(db: Executor): Promise<Date | null> {
  const [row] = await db.select({ at: sql<Date | null>`max(${economicEvents.lastSeenAt})` }).from(economicEvents);
  return row?.at ? new Date(row.at) : null;
}

export type NearbyTrade = {
  id: string;
  login: number;
  symbol: string;
  side: 'buy' | 'sell';
  openedAt: Date;
  closedAt: Date;
  netProfit: string;
};

export type EventDetail = {
  event: NewsEvent;
  /** Other occurrences of the same event (same title and currency), newest first. */
  history: (NewsEvent & { trades: NearbyTrade[] })[];
};

const NEARBY_MS = 60 * 60_000;

/** Event panel (news spec §2): details, past occurrences with forecast/previous, Joe's trades ±60 min. */
export async function eventDetail(db: Executor, id: string, now: Date): Promise<EventDetail | null> {
  const [event] = await db.select(eventColumns).from(economicEvents).where(eq(economicEvents.id, id));
  if (!event) return null;
  const history = await db
    .select(eventColumns)
    .from(economicEvents)
    .where(and(visible, eq(economicEvents.title, event.title), eq(economicEvents.currency, event.currency)))
    .orderBy(desc(economicEvents.eventAt))
    .limit(24);
  const past = history.filter((h) => h.eventAt.getTime() <= now.getTime());
  const withTrades = await Promise.all(
    history.map(async (h) => ({
      ...h,
      trades: past.includes(h) ? await tradesAround(db, h.eventAt) : [],
    })),
  );
  return { event, history: withTrades };
}

/** Live trades opened or closed within ±60 min of an instant. */
export async function tradesAround(db: Executor, at: Date, ms = NEARBY_MS): Promise<NearbyTrade[]> {
  const from = new Date(at.getTime() - ms);
  const to = new Date(at.getTime() + ms);
  return db
    .select({
      id: trades.id,
      login: accounts.login,
      symbol: trades.symbol,
      side: trades.side,
      openedAt: trades.openedAt,
      closedAt: trades.closedAt,
      netProfit: trades.netProfit,
    })
    .from(trades)
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .where(and(eq(trades.source, 'live'), or(between(trades.openedAt, from, to), between(trades.closedAt, from, to))))
    .orderBy(asc(trades.openedAt));
}

export type EventTitle = { title: string; currency: string; impact: NewsImpact; occurrences: number; lastAt: Date };

/** Event history page: distinct events (title + currency), most recent first, optionally searched. */
export async function eventTitles(
  db: Executor,
  opts: { search?: string | undefined; currencies?: string[] | undefined; limit?: number },
): Promise<EventTitle[]> {
  const rows = await db
    .select({
      title: economicEvents.title,
      currency: economicEvents.currency,
      impact: sql<NewsImpact>`(array_agg(${economicEvents.impact} order by ${economicEvents.eventAt} desc))[1]`,
      occurrences: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${economicEvents.eventAt})`,
    })
    .from(economicEvents)
    .where(
      and(
        visible,
        opts.search ? ilike(economicEvents.title, `%${opts.search.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
        opts.currencies?.length ? inArray(economicEvents.currency, opts.currencies) : undefined,
      ),
    )
    .groupBy(economicEvents.title, economicEvents.currency)
    .orderBy(desc(sql`max(${economicEvents.eventAt})`))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({ ...r, lastAt: new Date(r.lastAt) }));
}

/** Every visible occurrence of one event, newest first (event history drill-down). */
export async function occurrences(db: Executor, title: string, currency: string): Promise<NewsEvent[]> {
  return db
    .select(eventColumns)
    .from(economicEvents)
    .where(and(visible, eq(economicEvents.title, title), eq(economicEvents.currency, currency)))
    .orderBy(desc(economicEvents.eventAt))
    .limit(200);
}

export type NewsHubSummary = {
  today: NewsEvent[];
  next: NewsEvent | null;
  /** Restricted events whose window contains `now` (⚠️ line on the hub, news spec §3). */
  activeRestrictions: NewsEvent[];
  /** Red folders per weekday this week, Mon–Fri. */
  week: { date: string; red: number }[];
  currencies: string[];
  lastSync: Date | null;
};

/** The hub's News card (news spec §3). */
export async function newsHubSummary(db: Executor, now: Date): Promise<NewsHubSummary> {
  const settings = await getNewsSettings(db);
  const todayKey = tradingDay(now, NEWS_DAYS);
  const monday = mondayOf(todayKey);
  const { start, end } = weekRange(monday);
  const weekEvents = await listEvents(db, { from: start, to: end, currencies: settings.currencies });
  const today = dayRange(todayKey, NEWS_DAYS);
  const todays = weekEvents.filter(
    (e) => e.eventAt >= today.start && e.eventAt < today.end && (e.impact === 'high' || e.isRestricted),
  );
  const upcoming = await listEvents(db, {
    from: now,
    to: new Date(now.getTime() + 14 * 86_400_000),
    currencies: settings.currencies,
    impacts: ['high'],
  });
  return {
    today: todays,
    next: nextEvent(upcoming, now),
    activeRestrictions: activeRestrictions(weekEvents, now, settings),
    week: weekDates(monday)
      .slice(0, 5)
      .map((date) => ({
        date,
        red: weekEvents.filter((e) => e.impact === 'high' && tradingDay(e.eventAt, NEWS_DAYS) === date).length,
      })),
    currencies: settings.currencies,
    lastSync: await lastNewsSync(db),
  };
}

export type AccountRestriction = {
  id: string;
  login: number;
  phase: string;
  status: string;
  newsAddon: boolean;
  override: boolean | null;
  /** Effective: whether restriction-window badges show for this account's trades. */
  applies: boolean;
};

/** Per-account restriction setting (news spec §5), with the default worked out from phase and add-on. */
export async function accountRestrictions(db: Executor): Promise<AccountRestriction[]> {
  const rows = await db
    .select({
      id: accounts.id,
      login: accounts.login,
      phase: accounts.phase,
      status: accounts.status,
      override: accounts.newsRestriction,
      rulesRaw: sql<unknown>`(
        select r.raw from rule_snapshots r where r.account_id = "accounts"."id" order by r.taken_at desc limit 1
      )`,
    })
    .from(accounts)
    .where(eq(accounts.isBacktest, false))
    .orderBy(desc(accounts.lastSeenAt), asc(accounts.login));
  return rows.map(({ rulesRaw, ...a }) => {
    const newsAddon = hasNewsAddon(rulesRaw);
    return { ...a, newsAddon, applies: restrictionApplies({ phase: a.phase, newsAddon, override: a.override }) };
  });
}

/** `null` returns the account to its default. */
export async function setAccountRestriction(db: Executor, accountId: string, value: boolean | null) {
  await db.update(accounts).set({ newsRestriction: value }).where(eq(accounts.id, accountId));
}
