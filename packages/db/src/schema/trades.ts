import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, money, price, timestamps, tstz } from './_shared';
import { accounts, cycles } from './accounts';
import { riskSource, tradeSide, tradeSource } from './enums';

/** Live trades are never deleted (trigger); only source = 'backtest' rows can be. */
export const trades = pgTable(
  'trades',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    cycleId: uuid().references(() => cycles.id),
    source: tradeSource().notNull().default('live'),
    ticket: text().notNull(),
    symbol: text().notNull(),
    side: tradeSide().notNull(),
    lots: numeric({ precision: 12, scale: 2 }).notNull(),
    volume: bigint({ mode: 'number' }),
    openPrice: price().notNull(),
    closePrice: price().notNull(),
    openedAt: tstz().notNull(),
    closedAt: tstz().notNull(),
    slFinal: price(),
    tpFinal: price(),
    profit: money().notNull(),
    commission: money().notNull().default('0'),
    swap: money().notNull().default('0'),
    netProfit: money().notNull().generatedAlwaysAs(sql`profit + commission + swap`),
    firmRrRaw: text(),
    firmRr: numeric({ precision: 10, scale: 2 }),
    isNews: boolean(),
    reasonCode: integer(),
    riskUsd: money(),
    riskSource: riskSource(),
    raw: jsonb(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('trades_account_ticket_key').on(t.accountId, t.ticket),
    index().on(t.accountId, t.closedAt),
    index().on(t.source, t.closedAt),
  ],
);
