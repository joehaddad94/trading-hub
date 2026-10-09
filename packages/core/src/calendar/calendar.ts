import Decimal from 'decimal.js';
import { type MetricTrade, type TradeStats, tradeStats } from '../metrics/metrics';
import { type DayBoundary, DEFAULT_DAY_BOUNDARY, tradingDay } from '../time/days';
import { type SessionName, sessionOf } from '../time/sessions';

/** A closed trade as the calendar needs it (tracker spec §8.2). Money as decimal strings. */
export type CalendarTrade = MetricTrade & {
  id: string;
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: string;
  openedAt: Date;
  closedAt: Date;
  commission: string;
  swap: string;
  isNews: boolean | null;
  journaled: boolean;
  followedPlan: boolean | null;
};

export type DayStats = TradeStats & {
  date: string;
  /** The day's trades in close order (`trades` is the count, from TradeStats). */
  entries: CalendarTrade[];
  commissionSwap: Decimal;
  lots: Decimal;
  avgHoldMs: number | null;
  best: CalendarTrade | null;
  worst: CalendarTrade | null;
  symbols: string[];
  sessions: SessionName[];
  accountIds: string[];
  /** Net per account, for the per-account dots when the scope has several accounts. */
  byAccount: { accountId: string; net: Decimal }[];
  hasNews: boolean;
  /** Every trade of the day has a journal entry. */
  journaled: boolean;
  /** null when no trade of the day has a followed-plan answer. */
  followedPlan: boolean | null;
};

export function dayStats(date: string, trades: CalendarTrade[]): DayStats {
  const stats = tradeStats(trades);
  const byNet = [...trades].sort((a, b) => new Decimal(b.netProfit).comparedTo(a.netProfit));
  const holds = trades.map((t) => t.closedAt.getTime() - t.openedAt.getTime());
  const byAccount = new Map<string, Decimal>();
  for (const t of trades) byAccount.set(t.accountId, (byAccount.get(t.accountId) ?? new Decimal(0)).plus(t.netProfit));
  const answered = trades.filter((t) => t.followedPlan !== null);
  return {
    ...stats,
    date,
    entries: trades,
    commissionSwap: trades.reduce((sum, t) => sum.plus(t.commission).plus(t.swap), new Decimal(0)),
    lots: trades.reduce((sum, t) => sum.plus(t.lots), new Decimal(0)),
    avgHoldMs: holds.length ? Math.round(holds.reduce((a, b) => a + b, 0) / holds.length) : null,
    best: byNet[0] ?? null,
    worst: byNet.at(-1) ?? null,
    symbols: [...new Set(trades.map((t) => t.symbol))].sort(),
    sessions: [...new Set(trades.map((t) => sessionOf(t.openedAt)))],
    accountIds: [...byAccount.keys()],
    byAccount: [...byAccount.entries()].map(([accountId, net]) => ({ accountId, net })),
    hasNews: trades.some((t) => t.isNews),
    journaled: trades.length > 0 && trades.every((t) => t.journaled),
    followedPlan: answered.length ? answered.every((t) => t.followedPlan) : null,
  };
}

export type CalendarDay = {
  date: string;
  day: number;
  weekday: number; // 1 = Monday … 7 = Sunday
  inMonth: boolean;
  isToday: boolean;
  stats: DayStats | null;
  /** 0–1: |net| relative to the month's largest absolute day net (tile colour intensity). */
  intensity: number;
};

export type PeriodSummary = TradeStats & {
  tradingDays: number;
  greenDays: number;
  redDays: number;
};

export type MonthSummary = PeriodSummary & {
  bestDay: { date: string; net: Decimal } | null;
  worstDay: { date: string; net: Decimal } | null;
  avgTradesPerDay: Decimal | null;
  longestGreenStreak: number;
  longestRedStreak: number;
  commissionSwap: Decimal;
  /** Share of days with a followed-plan answer where every answered trade followed the plan. */
  planFollowedRate: Decimal | null;
};

export type MonthCalendar = {
  year: number;
  month: number;
  /** Weekday columns shown: Mon–Fri, plus Sat/Sun only when the month has a weekend trade. */
  weekdays: number[];
  weeks: { days: CalendarDay[]; summary: PeriodSummary }[];
  summary: MonthSummary;
};

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** ISO weekday of a calendar date (1 = Monday). Calendar dates carry no timezone. */
export const weekdayOf = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

function periodSummary(days: DayStats[]): PeriodSummary {
  return {
    ...tradeStats(days.flatMap((d) => d.entries)),
    tradingDays: days.length,
    greenDays: days.filter((d) => d.net.gt(0)).length,
    redDays: days.filter((d) => d.net.lt(0)).length,
  };
}

export type BuildMonthInput = {
  year: number;
  month: number;
  trades: CalendarTrade[];
  today: Date;
  boundary?: DayBoundary;
};

/** The §8.2 month grid with weekly and monthly summaries. Day buckets use the configured day boundary. */
export function buildMonth({
  year,
  month,
  trades,
  today,
  boundary = DEFAULT_DAY_BOUNDARY,
}: BuildMonthInput): MonthCalendar {
  const monthPrefix = `${year}-${pad(month)}-`;
  const byDay = new Map<string, CalendarTrade[]>();
  for (const t of trades) {
    const key = tradingDay(t.closedAt, boundary);
    if (!key.startsWith(monthPrefix)) continue;
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  const statsByDay = new Map([...byDay.entries()].map(([date, ts]) => [date, dayStats(date, ts)]));
  const maxAbs = Decimal.max(0, ...[...statsByDay.values()].map((s) => s.net.abs()));
  const todayKey = tradingDay(today, boundary);
  const weekend = [...statsByDay.keys()].some((d) => weekdayOf(d) > 5);
  const weekdays = weekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = isoDate(year, month, 1);
  const start = new Date(`${first}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (weekdayOf(first) - 1));
  const weeks: MonthCalendar['weeks'] = [];
  const cursor = new Date(start);
  while (true) {
    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      const date = cursor.toISOString().slice(0, 10);
      const weekday = i + 1;
      const inMonth = date.startsWith(monthPrefix);
      const stats = inMonth ? (statsByDay.get(date) ?? null) : null;
      if (weekdays.includes(weekday)) {
        days.push({
          date,
          day: cursor.getUTCDate(),
          weekday,
          inMonth,
          isToday: date === todayKey,
          stats,
          intensity: stats && maxAbs.gt(0) ? stats.net.abs().div(maxAbs).toNumber() : 0,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (days.some((d) => d.inMonth)) {
      const traded = days.flatMap((d) => (d.stats ? [d.stats] : []));
      weeks.push({ days, summary: periodSummary(traded) });
    }
    if (cursor.toISOString().slice(0, 10) > isoDate(year, month, daysInMonth)) break;
  }

  const ordered = [...statsByDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { year, month, weekdays, weeks, summary: monthSummary(ordered) };
}

export function monthSummary(days: DayStats[]): MonthSummary {
  const base = periodSummary(days);
  const byNet = [...days].sort((a, b) => b.net.comparedTo(a.net));
  const answered = days.filter((d) => d.followedPlan !== null);
  let green = 0;
  let red = 0;
  let longestGreen = 0;
  let longestRed = 0;
  for (const d of days) {
    green = d.net.gt(0) ? green + 1 : 0;
    red = d.net.lt(0) ? red + 1 : 0;
    longestGreen = Math.max(longestGreen, green);
    longestRed = Math.max(longestRed, red);
  }
  const best = byNet[0];
  const worst = byNet.at(-1);
  return {
    ...base,
    bestDay: best?.net.gt(0) ? { date: best.date, net: best.net } : null,
    worstDay: worst?.net.lt(0) ? { date: worst.date, net: worst.net } : null,
    avgTradesPerDay: days.length ? new Decimal(base.trades).div(days.length) : null,
    longestGreenStreak: longestGreen,
    longestRedStreak: longestRed,
    commissionSwap: days.reduce((sum, d) => sum.plus(d.commissionSwap), new Decimal(0)),
    planFollowedRate: answered.length
      ? new Decimal(answered.filter((d) => d.followedPlan).length).div(answered.length)
      : null,
  };
}

/** Previous / next month, for the ‹ Month Year › switcher. */
export function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** `2026-10` → { year, month }; null when malformed or out of range. */
export function parseMonth(value: string | null | undefined): { year: number; month: number } | null {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100 ? { year, month } : null;
}

export const formatMonthParam = (year: number, month: number) => `${year}-${pad(month)}`;
