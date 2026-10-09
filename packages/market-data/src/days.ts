/** UTC day helpers for ingestion. Days are `YYYY-MM-DD` strings; ranges are [start, end). */
const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseUtcDay(day: string): Date | null {
  if (!DAY_RE.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : date;
}

export function utcDayRange(day: string): { from: Date; to: Date } {
  const from = parseUtcDay(day);
  if (!from) throw new Error(`Invalid day: ${day}`);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

export function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The cron's target: the UTC day before `now`. */
export function previousUtcDay(now: Date): string {
  return formatUtcDay(new Date(now.getTime() - DAY_MS));
}

/** Every UTC day from `from` to `to`, both inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const start = parseUtcDay(from);
  const end = parseUtcDay(to);
  if (!start || !end) throw new Error(`Invalid range: ${from} → ${to}`);
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) days.push(formatUtcDay(new Date(t)));
  return days;
}

/** The backfill window (spec §1.3: 12 months back), ending yesterday. */
export function backfillWindow(now: Date, months = 12): { from: string; to: string } {
  const start = new Date(now.getTime());
  start.setUTCMonth(start.getUTCMonth() - months);
  return { from: formatUtcDay(start), to: previousUtcDay(now) };
}
