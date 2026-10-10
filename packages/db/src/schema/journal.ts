import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, money, price, timestamps } from './_shared';
import { tagKind } from './enums';
import { trades } from './trades';

export const tags = pgTable(
  'tags',
  {
    id: id(),
    name: text().notNull(),
    kind: tagKind().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.kind), unique('tags_kind_name_unique').on(t.kind, t.name)],
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: id(),
    tradeId: uuid()
      .notNull()
      .unique()
      .references(() => trades.id, { onDelete: 'cascade' }),
    setupTagId: uuid().references(() => tags.id),
    followedPlan: boolean(),
    initialSl: price(),
    plannedRr: numeric({ precision: 10, scale: 2 }),
    plannedRiskUsd: money(),
    emotionBefore: text(),
    emotionAfter: text(),
    mistakes: text().array(),
    notes: text(),
    rating: integer(),
    ...timestamps,
  },
  (t) => [check('journal_entries_rating_range', sql`${t.rating} between 1 and 5`)],
);

export const tradeTags = pgTable(
  'trade_tags',
  {
    tradeId: uuid()
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.tagId] })],
);

export const screenshots = pgTable('screenshots', {
  id: id(),
  tradeId: uuid()
    .notNull()
    .references(() => trades.id, { onDelete: 'cascade' }),
  storagePath: text().notNull(),
  caption: text(),
  ...timestamps,
});

export const dailyNotes = pgTable('daily_notes', {
  id: id(),
  date: date().notNull().unique(),
  notes: text(),
  mood: text(),
  marketContext: text(),
  ...timestamps,
});

/**
 * Risk Joe took on a trade, set in one tap from the risk queue (0.5%, 1%, …) without journaling it.
 * Separate from journal_entries so tagging risk doesn't mark a trade as journaled.
 */
export const tradeRisk = pgTable(
  'trade_risk',
  {
    tradeId: uuid()
      .primaryKey()
      .references(() => trades.id, { onDelete: 'cascade' }),
    riskUsd: money().notNull(),
    /** What was tapped, as % of the account's starting balance; null when entered in dollars. */
    riskPct: numeric({ precision: 5, scale: 2 }),
    ...timestamps,
  },
  (t) => [check('trade_risk_positive', sql`${t.riskUsd} > 0`)],
);
