import { TZDate } from '@date-fns/tz';
import { SESSION_TZ, SESSIONS, type SessionName } from '@trading/core';
import { MINUTE_MS } from './bars';

/**
 * Choosing where a replay starts (backtester spec §3.1): calendar days in the chart's time zone, the kill zones
 * that open on a day, which days trade, a random start and the snap to the next real candle. Pure.
 */

export type Zone = Exclude<SessionName, 'outside'>;
/** A calendar day; `m` is 1–12. */
export type CalendarDay = { y: number; m: number; d: number };

const DAY_MS = 24 * 60 * MINUTE_MS;

export function dayOf(ts: number, timezone: string): CalendarDay {
  const t = new TZDate(ts, timezone);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

export function addDays(day: CalendarDay, n: number): CalendarDay {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function sameDay(a: CalendarDay | null, b: CalendarDay | null): boolean {
  return !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(day: CalendarDay): number {
  return (new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay() + 6) % 7;
}

/** The time `minute` (minutes after midnight) on `day`, read in `timezone`. */
export function timeOn(day: CalendarDay, minute: number, timezone: string): number {
  return new TZDate(day.y, day.m - 1, day.d, Math.floor(minute / 60), minute % 60, 0, 0, timezone).getTime();
}

/** Market hours (the weekly schedule from `@trading/market-data`), passed in so there is one definition. */
export type IsOpen = (minute: Date) => boolean;

/** True when the market trades at some point of `day` in `timezone` (checked every 30 minutes). */
export function dayHasMarket(day: CalendarDay, timezone: string, isOpen: IsOpen): boolean {
  const from = timeOn(day, 0, timezone);
  const to = timeOn(addDays(day, 1), 0, timezone);
  for (let t = from; t < to; t += 30 * MINUTE_MS) if (isOpen(new Date(t))) return true;
  return false;
}

/** Why a day can't be picked, or null when it can. `data` is the first and last candle (ms). */
export function dayBlocked(
  day: CalendarDay,
  timezone: string,
  data: { from: number; to: number } | null,
  now: number,
  isOpen: IsOpen,
): string | null {
  const from = timeOn(day, 0, timezone);
  const to = timeOn(addDays(day, 1), 0, timezone);
  if (from > now) return 'In the future';
  if (data && (to <= data.from || from > data.to)) return 'No candles on this day';
  if (!dayHasMarket(day, timezone, isOpen)) return 'Market closed';
  return null;
}

/** Month grid, Monday first; null pads the first week. */
export function monthGrid(y: number, m: number): (CalendarDay | null)[] {
  const first = { y, m, d: 1 };
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (CalendarDay | null)[] = Array.from({ length: weekdayOf(first) }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push({ y, m, d });
  return cells;
}

/**
 * Kill zones that open on `day` in the chart's time zone, earliest first. In Beirut that is Asia (the NY evening
 * before), London, NY AM and NY PM; in New York it is London, NY AM, NY PM and Asia.
 */
export function zonesOnDay(day: CalendarDay, timezone: string): { name: Zone; label: string; at: number }[] {
  const from = timeOn(day, 0, timezone);
  const to = timeOn(addDays(day, 1), 0, timezone);
  const ny = dayOf(from, SESSION_TZ);
  const found: { name: Zone; label: string; at: number }[] = [];
  for (let offset = -1; offset <= 1; offset += 1) {
    for (const zone of SESSIONS) {
      const at = timeOn(addDays(ny, offset), zone.start, SESSION_TZ);
      if (at >= from && at < to) found.push({ name: zone.name, label: zone.label, at });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** A replay start: a day and a clock time on it (minutes after midnight), in the chart's time zone. */
export type StartPick = { day: CalendarDay; minute: number };

export function pickTime(pick: StartPick, timezone: string): number {
  return timeOn(pick.day, pick.minute, timezone);
}

/** The pick a time stands for, in `timezone`. */
export function pickOf(ts: number, timezone: string): StartPick {
  const t = new TZDate(ts, timezone);
  return { day: dayOf(ts, timezone), minute: t.getHours() * 60 + t.getMinutes() };
}

/** "16:30", "1630", "9:30", "9" → minutes after midnight, or null. */
export function parseClock(text: string): number | null {
  const m = /^\s*(\d{1,2})(?:[:.h]?(\d{2}))?\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

export function formatClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** A gap longer than this between the pick and the next candle means the market was closed. */
export const CLOSED_GAP_MS = 30 * MINUTE_MS;

/**
 * Where the replay cursor goes, given the first candle at or after the picked time (`next`, null at the end of
 * the data). The cursor is the picked minute, so the replay bar reads the time you chose and that minute's
 * candle is the newest on the chart. When the market was closed then (`snapped`: a weekend night, the daily
 * break, a holiday), it is the first candle after.
 */
export function resolveStart(target: number, next: number | null): { cursor: number; snapped: boolean } | null {
  if (next === null) return null;
  const snapped = next - target > CLOSED_GAP_MS;
  return { cursor: snapped ? next : Math.floor(target / MINUTE_MS) * MINUTE_MS, snapped };
}

/**
 * A random kill-zone open between `from` and `to` (the data range, ms) on a weekday, for practice without
 * choosing a favourite day. `rand` returns [0, 1).
 */
export function randomStart(
  from: number,
  to: number,
  rand: () => number,
  timezone: string,
  isOpen: IsOpen,
): StartPick | null {
  const last = to - DAY_MS;
  if (last <= from) return null;
  for (let tries = 0; tries < 20; tries += 1) {
    const day = dayOf(from + rand() * (last - from), timezone);
    const zones = zonesOnDay(day, timezone).filter((z) => isOpen(new Date(z.at)) && z.at >= from && z.at < last);
    const zone = zones[Math.floor(rand() * zones.length)];
    if (zone) return pickOf(zone.at, timezone);
  }
  return null;
}
