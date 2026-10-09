import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from './_shared';

/** News spec §1.1: High = red folder, Medium = orange, Low = yellow, Holiday = grey. */
export const eventImpact = pgEnum('event_impact', ['high', 'medium', 'low', 'holiday']);

/**
 * Economic calendar (news spec §1.3). Rows are never deleted: a rescheduled duplicate gets `superseded_by`,
 * an event that vanished from a later export gets `cancelled_at`; both are hidden.
 */
export const economicEvents = pgTable(
  'economic_events',
  {
    id: id(),
    source: text().notNull().default('fundednext'),
    externalId: integer().notNull(),
    title: text().notNull(),
    currency: text().notNull(),
    impact: eventImpact().notNull(),
    eventAt: tstz().notNull(),
    forecast: text(),
    previous: text(),
    /** Not provided by FundedNext (news spec §6); kept for a later provider. */
    actual: text(),
    isRestricted: boolean().notNull().default(false),
    restrictionLabel: text(),
    firstSeenAt: tstz().notNull(),
    lastSeenAt: tstz().notNull(),
    supersededBy: uuid().references((): AnyPgColumn => economicEvents.id),
    cancelledAt: tstz(),
    raw: jsonb(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.source, t.externalId),
    index('economic_events_visible_at')
      .on(t.eventAt)
      .where(sql`${t.supersededBy} is null and ${t.cancelledAt} is null`),
    index().on(t.currency, t.eventAt),
  ],
);
