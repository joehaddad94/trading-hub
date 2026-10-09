import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** Display timezone (CLAUDE.md rule 6): store UTC, show Asia/Beirut. */
export const DISPLAY_TZ = 'Asia/Beirut';

export function formatBeirut(date: Date, pattern = 'd MMM yyyy, HH:mm'): string {
  return format(new TZDate(date, DISPLAY_TZ), pattern);
}
