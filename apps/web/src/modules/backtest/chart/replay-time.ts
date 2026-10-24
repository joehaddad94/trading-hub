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
