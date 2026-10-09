import { DUPLICATE_WINDOW_MS, resolveDuplicates } from '@trading/core';
import type { Executor } from '@trading/db';
import { and, eq, gte, inArray, isNull, lt, sql } from '@trading/db/orm';
import { economicEvents } from '@trading/db/schema';
import type { PlannedNews } from '../plan';

const SOURCE = 'fundednext';
const CHUNK = 500;

export type NewsSummary = { events: number; cancelled: number; superseded: number };

/**
 * Writes the export's news section (news spec §1.3). Idempotent upserts by firm id; a file older than what
 * the DB already saw never overwrites newer event fields. Then, in the synced range: rescheduled duplicates are hidden, then
 * events the file no longer lists are hidden as cancelled (only for complete files).
 */
export async function applyNews(
  tx: Executor,
  news: PlannedNews,
  seenAt: Date,
  complete: boolean,
): Promise<NewsSummary> {
  const summary: NewsSummary = { events: 0, cancelled: 0, superseded: 0 };
  for (let i = 0; i < news.events.length; i += CHUNK) {
    const rows = news.events.slice(i, i + CHUNK).map((e) => ({
      source: SOURCE,
      externalId: e.externalId,
      title: e.title,
      currency: e.currency,
      impact: e.impact,
      eventAt: e.eventAt,
      forecast: e.forecast,
      previous: e.previous,
      isRestricted: e.isRestricted,
      restrictionLabel: e.restrictionLabel,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      raw: e.raw,
    }));
    await tx
      .insert(economicEvents)
      .values(rows)
      .onConflictDoUpdate({
        target: [economicEvents.source, economicEvents.externalId],
        set: {
          title: sql`excluded.title`,
          currency: sql`excluded.currency`,
          impact: sql`excluded.impact`,
          eventAt: sql`excluded.event_at`,
          forecast: sql`excluded.forecast`,
          previous: sql`excluded.previous`,
          isRestricted: sql`excluded.is_restricted`,
          restrictionLabel: sql`excluded.restriction_label`,
          lastSeenAt: sql`excluded.last_seen_at`,
          cancelledAt: null,
          raw: sql`excluded.raw`,
        },
        // Strictly newer files only: an older or repeated file never resurrects what a newer one hid.
        setWhere: sql`${economicEvents.lastSeenAt} < excluded.last_seen_at`,
      });
    summary.events += rows.length;
  }

  // Duplicates first: a listing replaced by a rescheduled one is superseded, not cancelled.
  summary.superseded = await dedupeWindow(tx, news);

  if (complete && news.range) {
    const cancelled = await tx
      .update(economicEvents)
      .set({ cancelledAt: seenAt })
      .where(
        and(
          eq(economicEvents.source, SOURCE),
          gte(economicEvents.eventAt, news.range.start),
          lt(economicEvents.eventAt, news.range.end),
          lt(economicEvents.lastSeenAt, seenAt),
          isNull(economicEvents.cancelledAt),
          isNull(economicEvents.supersededBy),
        ),
      )
      .returning({ id: economicEvents.id });
    summary.cancelled = cancelled.length;
  }

  return summary;
}

/** Re-runs the duplicate rule over every visible-or-superseded event near the synced events. */
async function dedupeWindow(tx: Executor, news: PlannedNews): Promise<number> {
  const times = news.events.map((e) => e.eventAt.getTime());
  const from = news.range?.start.getTime() ?? Math.min(...times);
  const to = news.range?.end.getTime() ?? Math.max(...times);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const rows = await tx
    .select({
      id: economicEvents.id,
      externalId: economicEvents.externalId,
      currency: economicEvents.currency,
      title: economicEvents.title,
      eventAt: economicEvents.eventAt,
      lastSeenAt: economicEvents.lastSeenAt,
      supersededBy: economicEvents.supersededBy,
    })
    .from(economicEvents)
    .where(
      and(
        eq(economicEvents.source, SOURCE),
        isNull(economicEvents.cancelledAt),
        gte(economicEvents.eventAt, new Date(from - DUPLICATE_WINDOW_MS)),
        lt(economicEvents.eventAt, new Date(to + DUPLICATE_WINDOW_MS)),
      ),
    );
  const resolved = resolveDuplicates(rows);
  const changes = new Map<string | null, string[]>();
  for (const r of rows) {
    const next = resolved.get(r.id) ?? null;
    if (next !== r.supersededBy) changes.set(next, [...(changes.get(next) ?? []), r.id]);
  }
  for (const [winner, ids] of changes) {
    await tx.update(economicEvents).set({ supersededBy: winner }).where(inArray(economicEvents.id, ids));
  }
  return [...resolved.values()].filter((v) => v !== null).length;
}
