/** Economic calendar logic shared by the importer, the News module and the Tracker (news spec). */

export type NewsImpact = 'high' | 'medium' | 'low' | 'holiday';

export const IMPACT_FROM_FIRM: Record<string, NewsImpact> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
  Holiday: 'holiday',
};

/** Folder colours (news spec §1.1): High red, Medium orange, Low yellow, Holiday grey. */
export const IMPACT_COLOURS: Record<NewsImpact, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
  holiday: '#9ca3af',
};

/** Two listings of the same event within this window are one event, rescheduled (news spec §1.3). */
export const DUPLICATE_WINDOW_MS = 3 * 3600_000;

/** The synced range `{ start: '2026-10-03', end: '2026-10-24' }` (UTC dates, inclusive) as instants. */
export function newsRange(range: { start: string; end: string }): { start: Date; end: Date } {
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export type DedupeEvent = {
  id: string;
  externalId: number;
  currency: string;
  title: string;
  eventAt: Date;
  lastSeenAt: Date;
};

/**
 * Dedupe/reschedule rule (news spec §1.3): within a currency, listings with the same title less than 3 hours
 * apart are one event. The listing seen in the latest export wins; when both are in the same export, the
 * newer listing (higher firm id) wins. Returns, for every event, the id of the event that supersedes it
 * (null for winners). Listings are chained: A–B 2h apart and B–C 2h apart are one cluster.
 */
export function resolveDuplicates(events: DedupeEvent[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const groups = new Map<string, DedupeEvent[]>();
  for (const e of events) {
    const key = `${e.currency}\u0000${e.title.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
    let cluster: DedupeEvent[] = [];
    const flush = () => {
      const winner = [...cluster].sort(
        (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime() || b.externalId - a.externalId,
      )[0];
      for (const e of cluster) out.set(e.id, e === winner ? null : (winner?.id ?? null));
      cluster = [];
    };
    for (const e of group) {
      const last = cluster.at(-1);
      if (last && e.eventAt.getTime() - last.eventAt.getTime() >= DUPLICATE_WINDOW_MS) flush();
      cluster.push(e);
    }
    flush();
  }
  return out;
}
