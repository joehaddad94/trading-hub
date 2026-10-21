import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `<input type="datetime-local">` value read in the chart's time zone → UTC minute (ms), or null. */
export function localInputToUtc(value: string, timezone: string): number | null {
  const m = LOCAL_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const date = new TZDate(y, mo - 1, d, h, mi, 0, 0, timezone);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** UTC ms → `datetime-local` value in the chart's time zone. */
export function utcToLocalInput(ms: number, timezone: string): string {
  return format(new TZDate(ms, timezone), "yyyy-MM-dd'T'HH:mm");
}

/** Cursor readout, e.g. "Wed 7 Oct 2026 17:37". */
export function formatCursor(ms: number, timezone: string): string {
  return format(new TZDate(ms, timezone), 'EEE d MMM yyyy HH:mm');
}

/** Phone readout, e.g. "7 Oct 17:37". */
export function formatCursorShort(ms: number, timezone: string): string {
  return format(new TZDate(ms, timezone), 'd MMM HH:mm');
}

/** Default replay start: one week back, on the hour, so a bare Start press has something to replay. */
export function defaultReplayStart(now: number): number {
  const HOUR = 3_600_000;
  return Math.floor((now - 7 * 24 * HOUR) / HOUR) * HOUR;
}
