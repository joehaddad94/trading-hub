import { TZDate } from '@date-fns/tz';

/** Day boundary (tracker spec §8.2): default Asia/Beirut, midnight. Option: America/New_York 17:00. */
export type DayBoundary = { timeZone: string; rolloverHour: number };

export const DEFAULT_DAY_BOUNDARY: DayBoundary = { timeZone: 'Asia/Beirut', rolloverHour: 0 };

/**
 * Trading day of an instant as 'YYYY-MM-DD'. With a rollover hour H > 0, times at or after H belong to
 * the next day (NY 17:00 convention).
 */
export function tradingDay(at: Date, boundary: DayBoundary = DEFAULT_DAY_BOUNDARY): string {
  const shiftHours = boundary.rolloverHour > 0 ? 24 - boundary.rolloverHour : 0;
  const shifted = new Date(at.getTime() + shiftHours * 3600_000);
  const local = new TZDate(shifted.getTime(), boundary.timeZone);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** UTC instants bounding a calendar month [start, end) in the given boundary. */
export function monthRange(year: number, month: number, boundary: DayBoundary = DEFAULT_DAY_BOUNDARY) {
  return {
    start: dayStartOf(year, month, 1, boundary),
    end: dayStartOf(year, month + 1, 1, boundary),
  };
}

/** UTC instants bounding one trading day 'YYYY-MM-DD' [start, end). DST-safe: 23, 24 or 25 hours long. */
export function dayRange(date: string, boundary: DayBoundary = DEFAULT_DAY_BOUNDARY) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { start: dayStartOf(y, m, d, boundary), end: dayStartOf(y, m, d + 1, boundary) };
}

/** With a rollover hour H > 0, day D starts at H on the previous calendar day. Day/month overflow normalises. */
function dayStartOf(year: number, month: number, day: number, boundary: DayBoundary): Date {
  const previous = boundary.rolloverHour > 0 ? 1 : 0;
  return new Date(
    new TZDate(year, month - 1, day - previous, boundary.rolloverHour, 0, 0, boundary.timeZone).getTime(),
  );
}
