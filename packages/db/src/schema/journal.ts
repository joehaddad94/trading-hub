import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, numeric, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
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
  (t) => [index().on(t.kind)],
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
