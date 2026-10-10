import {
  type DayBoundary,
  DEFAULT_DAY_BOUNDARY,
  eventsAroundTrade,
  type NearbyEvent,
  type NewsAnalytics,
  newsAnalytics,
  tradingDay,
} from '@trading/core';
import type { Executor } from '@trading/db';
import { eq } from '@trading/db/orm';
import { trades } from '@trading/db/schema';
import { accountRestrictions, getNewsSettings, listEvents, type NewsEvent } from '@trading/news/server';
import type { ResolvedScope } from './scope';
import { scopedTrades } from './trades';

/** Days (by the Tracker day boundary) with a red folder in the counted currencies — 📰 on the calendar. */
export async function redFolderDays(db: Executor, from: Date, to: Date, boundary: DayBoundary = DEFAULT_DAY_BOUNDARY) {
  const { currencies } = await getNewsSettings(db);
  const events = await listEvents(db, { from, to, impacts: ['high'], currencies });
  return [...new Set(events.map((e) => tradingDay(e.eventAt, boundary)))];
}

/** A day's high and medium events in the counted currencies, plus any restricted event (day view list). */
export async function dayEvents(db: Executor, from: Date, to: Date): Promise<NewsEvent[]> {
  const { currencies } = await getNewsSettings(db);
  const events = await listEvents(db, { from, to, impacts: ['high', 'medium'] });
  return events.filter((e) => currencies.includes(e.currency) || e.isRestricted);
}

export type TradeNews = {
  events: NearbyEvent<NewsEvent>[];
  /** Restriction badges apply to this account (news spec §5 per-account setting). */
  restrictionApplies: boolean;
  /** Opened or closed inside a restriction window, and the rule applies to the account. */
  inRestrictionWindow: boolean;
  window: { minutesBefore: number; minutesAfter: number };
};

const HOUR = 60 * 60_000;

/** "News around this trade" (news spec §4): counted-currency events within ±60 min of the open or close. */
export async function tradeNews(db: Executor, tradeId: string): Promise<TradeNews | null> {
  const [t] = await db
    .select({ accountId: trades.accountId, openedAt: trades.openedAt, closedAt: trades.closedAt })
    .from(trades)
    .where(eq(trades.id, tradeId));
  if (!t) return null;
  const settings = await getNewsSettings(db);
  const events = await listEvents(db, {
    from: new Date(t.openedAt.getTime() - HOUR),
    to: new Date(t.closedAt.getTime() + HOUR + 1),
  });
  const counted = events.filter((e) => e.impact !== 'holiday' && settings.currencies.includes(e.currency));
  const near = eventsAroundTrade(t, counted, settings);
  const applies = (await accountRestrictions(db)).find((a) => a.id === t.accountId)?.applies ?? false;
  return {
    events: near,
    restrictionApplies: applies,
    inRestrictionWindow: applies && near.some((e) => e.inWindow),
    window: { minutesBefore: settings.minutesBefore, minutesAfter: settings.minutesAfter },
  };
}

/** News vs non-news split for the Analytics screen (news spec §4), over the scope's closed trades. */
export async function newsSplit(
  db: Executor,
  scope: ResolvedScope,
  opts: { boundary?: DayBoundary; scratchThresholdR?: number } = {},
): Promise<(NewsAnalytics & { events: number; from: Date | null; to: Date | null }) | null> {
  const list = await scopedTrades(db, scope);
  if (list.length === 0) return null;
  const times = list.map((t) => t.closedAt.getTime());
  const from = new Date(Math.min(...list.map((t) => t.openedAt.getTime())) - 2 * 86_400_000);
  const to = new Date(Math.max(...times) + 2 * 86_400_000);
  const { currencies } = await getNewsSettings(db);
  const events = await listEvents(db, { from, to, impacts: ['high'], currencies });
  return {
    ...newsAnalytics(list, events, opts),
    events: events.length,
    from: events.length ? (events[0]?.eventAt ?? null) : null,
    to: events.length ? (events.at(-1)?.eventAt ?? null) : null,
  };
}
