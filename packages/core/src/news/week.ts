import { type DayBoundary, dayRange, tradingDay } from '../time/days';
import type { NewsImpact } from './news';

/** News is shown in Beirut calendar days with a midnight rollover (news spec §2), whatever the Tracker setting. */
export const NEWS_DAYS: DayBoundary = { timeZone: 'Asia/Beirut', rolloverHour: 0 };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The Monday of the week holding this calendar date. */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shift(date, -((day + 6) % 7));
}

/** `week` URL param → its Monday; anything invalid falls back to the current week. */
export function parseWeek(value: string | null | undefined, now: Date): string {
  if (value && DATE.test(value) && !Number.isNaN(Date.parse(value))) return mondayOf(value);
  return mondayOf(tradingDay(now, NEWS_DAYS));
}

export const shiftWeek = (monday: string, weeks: number) => shift(monday, weeks * 7);

export const weekDates = (monday: string) => Array.from({ length: 7 }, (_, i) => shift(monday, i));

/** Instants covering Monday 00:00 to the next Monday 00:00, Beirut. */
export function weekRange(monday: string): { start: Date; end: Date } {
  return { start: dayRange(monday, NEWS_DAYS).start, end: dayRange(shift(monday, 6), NEWS_DAYS).end };
}

export type CalendarEvent = {
  id: string;
  title: string;
  currency: string;
  impact: NewsImpact;
  eventAt: Date;
  forecast: string | null;
  previous: string | null;
  isRestricted: boolean;
};

export type NewsDay<E extends CalendarEvent> = {
  date: string;
  /** Events at the same minute share a slot (shown as one visual group). */
  slots: { at: Date; events: E[] }[];
};

/**
 * The week view's days (news spec §2): Mon–Fri always, Sat/Sun only when they have events; events grouped
 * by day (Beirut) and by identical time.
 */
export function groupWeek<E extends CalendarEvent>(monday: string, events: E[]): NewsDay<E>[] {
  const byDay = new Map<string, E[]>();
  for (const e of [...events].sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime())) {
    const day = tradingDay(e.eventAt, NEWS_DAYS);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  return weekDates(monday)
    .filter((date, i) => i < 5 || byDay.has(date))
    .map((date) => {
      const slots: NewsDay<E>['slots'] = [];
      for (const e of byDay.get(date) ?? []) {
        const last = slots.at(-1);
        if (last && last.at.getTime() === e.eventAt.getTime()) last.events.push(e);
        else slots.push({ at: e.eventAt, events: [e] });
      }
      return { date, slots };
    });
}

/** The first event at or after `now` (the highlighted row with the countdown). */
export function nextEvent<E extends CalendarEvent>(events: E[], now: Date): E | null {
  return (
    [...events]
      .filter((e) => e.eventAt.getTime() >= now.getTime() && e.impact !== 'holiday')
      .sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime())[0] ?? null
  );
}

export type RestrictionWindow = { minutesBefore: number; minutesAfter: number };

/** Restricted high-impact events whose window (news spec §5) contains `at`. */
export function activeRestrictions<E extends CalendarEvent>(events: E[], at: Date, window: RestrictionWindow): E[] {
  const t = at.getTime();
  return events.filter(
    (e) =>
      e.isRestricted &&
      e.impact === 'high' &&
      t >= e.eventAt.getTime() - window.minutesBefore * 60_000 &&
      t <= e.eventAt.getTime() + window.minutesAfter * 60_000,
  );
}

/** "in 2h 05m" / "in 4m 10s" countdown text; null once the time has passed. */
export function countdown(to: Date, now: Date): string | null {
  const ms = to.getTime() - now.getTime();
  if (ms < 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${pad(m)}m`;
  return `in ${m}m ${pad(s % 60)}s`;
}
