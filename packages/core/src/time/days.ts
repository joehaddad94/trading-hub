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
  const start = new TZDate(year, month - 1, 1, boundary.rolloverHour, 0, 0, boundary.timeZone);
  const end = new TZDate(year, month, 1, boundary.rolloverHour, 0, 0, boundary.timeZone);
  const shift = boundary.rolloverHour > 0 ? -24 * 3600_000 : 0;
  return { start: new Date(start.getTime() + shift), end: new Date(end.getTime() + shift) };
}
