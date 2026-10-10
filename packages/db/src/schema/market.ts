import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { id, price, timestamps, tstz } from './_shared';

/**
 * Backtester spec §1.2. Seeded with US30 and NAS100 in the migration. `firm_symbol` is the symbol FundedNext
 * uses for the same market (live vs backtest comparison); point value 10 USD per point per lot was derived
 * from the fixture's 99 trades.
 */
export const instruments = pgTable('instruments', {
  id: id(),
  code: text().notNull().unique(),
  provider: text().notNull().default('dukascopy'),
  providerCode: text().notNull(),
  displayName: text().notNull(),
  firmSymbol: text(),
  pointValuePerLot: numeric({ precision: 12, scale: 4 }).notNull(),
  priceDigits: integer().notNull(),
  defaultSpreadPoints: numeric({ precision: 10, scale: 2 }).notNull(),
  ...timestamps,
});

/** 1-minute bid candles, UTC minute open. 5m/15m are derived (spec §1.2), never stored. */
export const candles1m = pgTable(
  'candles_1m',
  {
    instrumentId: uuid()
      .notNull()
      .references(() => instruments.id),
    ts: tstz().notNull(),
    open: price().notNull(),
    high: price().notNull(),
    low: price().notNull(),
    close: price().notNull(),
    volume: numeric({ precision: 20, scale: 4 }),
  },
  (t) => [
    primaryKey({ columns: [t.instrumentId, t.ts] }),
    check('candles_1m_minute_aligned', sql`date_trunc('minute', ${t.ts}) = ${t.ts}`),
    check(
      'candles_1m_ohlc',
      sql`${t.high} >= greatest(${t.open}, ${t.close}, ${t.low}) and ${t.low} <= least(${t.open}, ${t.close})`,
    ),
  ],
);

/** ok · gaps (rows arrived, minutes missing in trading hours) · empty (nothing on an open day) · failed. */
export const ingestStatus = pgEnum('ingest_status', ['ok', 'gaps', 'empty', 'failed']);

export const dataIngestRuns = pgTable(
  'data_ingest_runs',
  {
    id: id(),
    instrumentId: uuid()
      .notNull()
      .references(() => instruments.id),
    fromTs: tstz().notNull(),
    toTs: tstz().notNull(),
    rowsInserted: integer().notNull().default(0),
    status: ingestStatus().notNull(),
    error: text(),
    /** Missing runs during trading hours: [{ from, to, minutes }]. */
    gaps: jsonb(),
    trigger: text().notNull().default('cron'),
    ranAt: tstz().notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index().on(t.instrumentId, t.fromTs), index().on(t.ranAt)],
);

/** Drawing tools (backtester spec §4). */
export const drawingTool = pgEnum('drawing_tool', ['horizontal', 'trend', 'long', 'short', 'measure']);

/**
 * Chart drawings, per instrument and optionally per backtest session (FK added with backtest_sessions, M21).
 * `points` are `[{ ts, price }]` (UTC ms, price) so they land on the same time/price on every timeframe;
 * `style` holds colour, width, lock and tool options (trend extension, position sizing).
 */
export const drawings = pgTable(
  'drawings',
  {
    id: id(),
    instrumentId: uuid()
      .notNull()
      .references(() => instruments.id),
    sessionId: uuid(),
    tool: drawingTool().notNull(),
    points: jsonb().notNull(),
    style: jsonb().notNull().default({}),
    label: text(),
    ...timestamps,
  },
  (t) => [index().on(t.instrumentId, t.sessionId)],
);
