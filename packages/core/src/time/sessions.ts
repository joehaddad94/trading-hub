import { TZDate } from '@date-fns/tz';

/** Kill zones in America/New_York (tracker spec §6, Joe 9 Oct 2026). One definition, shared with the backtester. */
export const SESSION_TZ = 'America/New_York';

export type SessionName = 'asia' | 'london' | 'ny_am' | 'ny_pm' | 'outside';

export const SESSIONS: { name: Exclude<SessionName, 'outside'>; label: string; start: number; end: number }[] = [
  { name: 'asia', label: 'Asia', start: 20 * 60, end: 24 * 60 },
  { name: 'london', label: 'London', start: 2 * 60, end: 5 * 60 },
  { name: 'ny_am', label: 'NY AM', start: 9 * 60 + 30, end: 12 * 60 },
  { name: 'ny_pm', label: 'NY PM', start: 13 * 60 + 30, end: 16 * 60 },
];

export const SESSION_LABELS: Record<SessionName, string> = {
  asia: 'Asia',
  london: 'London',
  ny_am: 'NY AM',
  ny_pm: 'NY PM',
  outside: 'Outside',
};

/** Session of a trade, by its open time. Start inclusive, end exclusive. */
export function sessionOf(openedAt: Date): SessionName {
  const ny = new TZDate(openedAt.getTime(), SESSION_TZ);
  const minute = ny.getHours() * 60 + ny.getMinutes();
  return SESSIONS.find((s) => minute >= s.start && minute < s.end)?.name ?? 'outside';
}
