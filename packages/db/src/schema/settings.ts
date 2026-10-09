import { sql } from 'drizzle-orm';
import { boolean, check, integer, numeric, pgTable, text } from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';

/** App-wide settings (tracker §8.2 day boundary, §6 scratch threshold, news §5 window). One row. */
export const appSettings = pgTable(
  'app_settings',
  {
    id: boolean().primaryKey().default(true),
    dayTimeZone: text().notNull().default('Asia/Beirut'),
    dayRolloverHour: integer().notNull().default(0),
    scratchThresholdR: numeric({ precision: 6, scale: 3 }).notNull().default('0.1'),
    /** News restriction window around high-impact restricted events (news spec §5; Joe: 5 min each side). */
    newsMinutesBefore: integer().notNull().default(5),
    newsMinutesAfter: integer().notNull().default(5),
    /** Currencies shown by default and counted for restrictions (news spec §8: USD only). */
    newsCurrencies: text().array().notNull().default(sql`'{USD}'::text[]`),
    ...timestamps,
  },
  (t) => [
    check('app_settings_singleton', sql`${t.id}`),
    check('app_settings_rollover_hour', sql`${t.dayRolloverHour} between 0 and 23`),
    check(
      'app_settings_news_window',
      sql`${t.newsMinutesBefore} between 0 and 120 and ${t.newsMinutesAfter} between 0 and 120`,
    ),
    check('app_settings_scratch', sql`${t.scratchThresholdR} >= 0 and ${t.scratchThresholdR} < 1`),
  ],
);
