import { type MetricTrade, type TradeStats, tradeStats } from '../metrics/metrics';
import { type DayBoundary, DEFAULT_DAY_BOUNDARY, tradingDay } from '../time/days';
import type { CalendarEvent, RestrictionWindow } from './week';

/** FundedNext rule code for the "News Trading Allowed" add-on (account applicable rules). */
export const NEWS_ADDON_CODE = 'ANT';

/** True when the account's rules carry the News Trading add-on (`ANT` = 1). */
export function hasNewsAddon(rulesRaw: unknown): boolean {
  const list = (rulesRaw as { applicable_rules?: unknown } | null)?.applicable_rules;
  if (!Array.isArray(list)) return false;
  return list.some(
    (r) =>
      typeof r === 'object' &&
      r !== null &&
      (r as { condition?: unknown }).condition === NEWS_ADDON_CODE &&
      String((r as { value?: unknown }).value) === '1',
  );
}

/**
 * Whether restriction-window badges apply to an account (news spec §5): Joe's override if set; otherwise on
 * only for funded accounts without the News Trading add-on (the rule doesn't apply to challenge phases).
 */
export function restrictionApplies(a: { phase: string; newsAddon: boolean; override: boolean | null }): boolean {
  return a.override ?? (a.phase === 'funded' && !a.newsAddon);
}

export type TradeTimes = { openedAt: Date; closedAt: Date };

export type NearbyEvent<E extends CalendarEvent> = E & {
  /** Minutes from the event to the trade's open (negative: opened before the event). */
  minutesFromOpen: number;
  minutesFromClose: number;
  /** Opened or closed inside this event's restriction window (restricted high-impact events only). */
  inWindow: boolean;
};

/** "News around this trade" (news spec §4): events within ±`ms` of the open or close. */
export function eventsAroundTrade<E extends CalendarEvent>(
  trade: TradeTimes,
  events: E[],
  window: RestrictionWindow,
  ms = 60 * 60_000,
): NearbyEvent<E>[] {
  const open = trade.openedAt.getTime();
  const close = trade.closedAt.getTime();
  return events
    .filter((e) => {
      const t = e.eventAt.getTime();
      return (t >= open - ms && t <= close + ms) || Math.abs(t - open) <= ms || Math.abs(t - close) <= ms;
    })
    .map((e) => {
      const t = e.eventAt.getTime();
      const inside = (x: number) => x >= t - window.minutesBefore * 60_000 && x <= t + window.minutesAfter * 60_000;
      return {
        ...e,
        minutesFromOpen: Math.round((open - t) / 60_000),
        minutesFromClose: Math.round((close - t) / 60_000),
        inWindow: e.isRestricted && e.impact === 'high' && (inside(open) || inside(close)),
      };
    });
}

export type NewsSplit = { news: TradeStats; other: TradeStats; newsTrades: number; otherTrades: number };

function split<T extends MetricTrade>(trades: T[], isNews: (t: T) => boolean, scratch?: number): NewsSplit {
  const news = trades.filter(isNews);
  const other = trades.filter((t) => !isNews(t));
  return {
    news: tradeStats(news, scratch),
    other: tradeStats(other, scratch),
    newsTrades: news.length,
    otherTrades: other.length,
  };
}

export type NewsAnalytics = {
  /** Trades on days with a red folder vs other days. */
  byDay: NewsSplit;
  /** Trades opened within ±30 min of a red folder vs not. */
  near: NewsSplit;
  /** Per event type: trades on days that had this red folder (e.g. FOMC, CPI, NFP days). */
  byEvent: { title: string; currency: string; days: number; stats: TradeStats }[];
};

/** News vs non-news performance split (news spec §4 Analytics). `events` = red folders in the counted currencies. */
export function newsAnalytics<T extends MetricTrade & TradeTimes & { closedAt: Date }>(
  trades: T[],
  events: CalendarEvent[],
  opts: { boundary?: DayBoundary; scratchThresholdR?: number; nearMs?: number } = {},
): NewsAnalytics {
  const boundary = opts.boundary ?? DEFAULT_DAY_BOUNDARY;
  const nearMs = opts.nearMs ?? 30 * 60_000;
  const red = events.filter((e) => e.impact === 'high');
  const redDays = new Map<string, CalendarEvent[]>();
  for (const e of red) {
    const day = tradingDay(e.eventAt, boundary);
    redDays.set(day, [...(redDays.get(day) ?? []), e]);
  }
  const dayOf = (t: T) => tradingDay(t.closedAt, boundary);
  const times = red.map((e) => e.eventAt.getTime()).sort((a, b) => a - b);
  const near = (t: T) => times.some((x) => Math.abs(x - t.openedAt.getTime()) <= nearMs);

  const types = new Map<string, { title: string; currency: string; days: Set<string> }>();
  for (const [day, list] of redDays) {
    for (const e of list) {
      const key = `${e.currency} ${e.title}`;
      const entry = types.get(key) ?? { title: e.title, currency: e.currency, days: new Set<string>() };
      entry.days.add(day);
      types.set(key, entry);
    }
  }
  return {
    byDay: split(trades, (t) => redDays.has(dayOf(t)), opts.scratchThresholdR),
    near: split(trades, near, opts.scratchThresholdR),
    byEvent: [...types.values()]
      .map((t) => {
        const onDays = trades.filter((tr) => t.days.has(dayOf(tr)));
        return {
          title: t.title,
          currency: t.currency,
          days: t.days.size,
          stats: tradeStats(onDays, opts.scratchThresholdR),
        };
      })
      .filter((t) => t.stats.trades > 0)
      .sort((a, b) => b.stats.trades - a.stats.trades),
  };
}
