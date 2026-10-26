import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, money, price, timestamps, tstz } from './_shared';
import { accounts } from './accounts';
import { tradeSide } from './enums';
import { tags } from './journal';
import { instruments } from './market';
import { trades } from './trades';

export const backtestSessionStatus = pgEnum('backtest_session_status', ['in_progress', 'completed']);
export const backtestOrderType = pgEnum('backtest_order_type', ['market', 'limit', 'stop']);
export const backtestOrderStatus = pgEnum('backtest_order_status', ['pending', 'open', 'closed', 'cancelled']);
export const backtestExitReason = pgEnum('backtest_exit_reason', ['tp', 'sl', 'breakeven', 'manual']);

/**
 * One backtesting run (backtester spec §7). Each owns a synthetic tracker account (`accounts.is_backtest`), so
 * its trades show under the tracker's Backtest scope. Deleting a session removes the account and its trades.
 */
export const backtestSessions = pgTable(
  'backtest_sessions',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .unique()
      .references(() => accounts.id),
    /** Auth user id of an invited Backtest Lab user; null = the app owner (Joe). */
    ownerId: uuid(),
    name: text().notNull(),
    instrumentIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    startTs: tstz(),
    endTs: tstz(),
    /** Where replay stopped (resume, M21). */
    cursorTs: tstz(),
    startingBalance: money().notNull().default('25000'),
    riskPct: numeric({ precision: 5, scale: 2 }).notNull().default('0.5'),
    /** Per instrument code: { spreadPoints, commissionPerLot, slippagePoints } (spec §6.2). */
    costs: jsonb().notNull().default({}),
    setupTagId: uuid().references(() => tags.id, { onDelete: 'set null' }),
    notes: text(),
    status: backtestSessionStatus().notNull().default('in_progress'),
    ...timestamps,
  },
  (t) => [index().on(t.status), index().on(t.ownerId)],
);

export const drawingTool = pgEnum('drawing_tool', ['horizontal', 'trend', 'long', 'short', 'measure']);

/**
 * Chart drawings, per instrument and optionally per backtest session.
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
    sessionId: uuid().references((): AnyPgColumn => backtestSessions.id, { onDelete: 'cascade' }),
    /** Auth user id of an invited Backtest Lab user; null = the app owner (Joe). */
    ownerId: uuid(),
    tool: drawingTool().notNull(),
    points: jsonb().notNull(),
    style: jsonb().notNull().default({}),
    label: text(),
    ...timestamps,
  },
  (t) => [index().on(t.instrumentId, t.sessionId)],
);

/** A simulated order from placing a long/short tool (spec §6). Becomes a `trades` row when it closes. */
export const backtestOrders = pgTable(
  'backtest_orders',
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => backtestSessions.id, { onDelete: 'cascade' }),
    instrumentId: uuid()
      .notNull()
      .references(() => instruments.id),
    drawingId: uuid().references(() => drawings.id, { onDelete: 'set null' }),
    side: tradeSide().notNull(),
    type: backtestOrderType().notNull(),
    status: backtestOrderStatus().notNull().default('pending'),
    lots: numeric({ precision: 12, scale: 2 }).notNull(),
    entry: price().notNull(),
    sl: price().notNull(),
    tp: price().notNull(),
    placedAt: tstz().notNull(),
    fillPrice: price(),
    filledAt: tstz(),
    initialSl: price(),
    initialTp: price(),
    closePrice: price(),
    closedAt: tstz(),
    exitReason: backtestExitReason(),
    ambiguous: boolean().notNull().default(false),
    /** SL/TP edits with the replay time: [{ at, sl, tp }]. */
    modifications: jsonb().notNull().default([]),
    /** Newest 1m bar already evaluated; the next advance starts after it. */
    processedUntil: tstz(),
    tradeId: uuid().references(() => trades.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index().on(t.sessionId, t.status)],
);

/**
 * Emails the owner lets into the Backtest Lab (Settings › Users), at most 10. They sign in with the email
 * alone; removing a row cuts access but keeps their runs (keyed by `user_id`, set on first sign-in).
 */
export const backtestUsers = pgTable(
  'backtest_users',
  {
    email: text().primaryKey(),
    userId: uuid().unique(),
    lastSignInAt: tstz(),
    ...timestamps,
  },
  (t) => [check('backtest_users_email_lower', sql`${t.email} = lower(${t.email})`)],
);

/** Failed email-only sign-ins per client IP, for throttling guesses (rows older than a day are pruned). */
export const signInFailures = pgTable(
  'sign_in_failures',
  {
    id: id(),
    ip: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.ip, t.at)],
);
