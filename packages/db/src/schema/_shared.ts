import { numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () => uuid().primaryKey().defaultRandom();

/** created_at / updated_at on every table; updated_at is maintained by a trigger (migration `set_updated_at`). */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

/** Money: numeric(14,2). Comes back from the driver as a string — convert with decimal.js, never parseFloat. */
export const money = () => numeric({ precision: 14, scale: 2 });

/** Prices: enough precision for indices and FX. */
export const price = () => numeric({ precision: 18, scale: 5 });

export const tstz = () => timestamp({ withTimezone: true });
