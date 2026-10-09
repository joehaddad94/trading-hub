import { sql } from 'drizzle-orm';
import { boolean, check, integer, numeric, pgTable, text } from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';

/** App-wide settings (tracker §8.2 day boundary, §6 scratch threshold). One row. */
export const appSettings = pgTable(
  'app_settings',
  {
    id: boolean().primaryKey().default(true),
    dayTimeZone: text().notNull().default('Asia/Beirut'),
    dayRolloverHour: integer().notNull().default(0),
    scratchThresholdR: numeric({ precision: 6, scale: 3 }).notNull().default('0.1'),
    ...timestamps,
  },
  (t) => [
    check('app_settings_singleton', sql`${t.id}`),
    check('app_settings_rollover_hour', sql`${t.dayRolloverHour} between 0 and 23`),
    check('app_settings_scratch', sql`${t.scratchThresholdR} >= 0 and ${t.scratchThresholdR} < 1`),
  ],
);
