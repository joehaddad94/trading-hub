import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** Cursor readout, e.g. "Wed 7 Oct 2026 17:37". */
export function formatCursor(ms: number, timezone: string): string {
  return format(new TZDate(ms, timezone), 'EEE d MMM yyyy HH:mm');
}

/** Phone readout, e.g. "7 Oct 17:37". */
export function formatCursorShort(ms: number, timezone: string): string {
  return format(new TZDate(ms, timezone), 'd MMM HH:mm');
}

/** Where the start panel opens before any replay: one week back, on the hour. */
export function defaultReplayStart(now: number): number {
  const HOUR = 3_600_000;
  return Math.floor((now - 7 * 24 * HOUR) / HOUR) * HOUR;
}
