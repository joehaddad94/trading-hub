import { sql } from 'drizzle-orm';
import { boolean, check, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, money, timestamps, tstz } from './_shared';
import { accounts, firms } from './accounts';
import { cashflowKind, importResult } from './enums';

/** Every export file kept verbatim so derived tables can be rebuilt (scripts/reprocess-imports.ts). */
export const rawImports = pgTable(
  'raw_imports',
  {
    id: id(),
    driveFileId: text().notNull(),
    fileName: text().notNull(),
    generatedAt: tstz(),
    schemaVersion: integer(),
    status: text(),
    errors: jsonb(),
    payload: jsonb().notNull(),
    importedAt: tstz(),
    importResult: importResult(),
    importError: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex('raw_imports_drive_file_id_key').on(t.driveFileId)],
);

/** Single row (id = true) driving sync-health checks (tracker spec §7). */
export const syncHealth = pgTable(
  'sync_health',
  {
    id: boolean().primaryKey().default(true),
    lastFileAt: tstz(),
    lastOkImportAt: tstz(),
    lastCheckAt: tstz(),
    lastAlertAt: tstz(),
    consecutiveFailures: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [check('sync_health_single_row', sql`${t.id}`)],
);

export const alertsLog = pgTable('alerts_log', {
  id: id(),
  kind: text().notNull(),
  message: text().notNull(),
  channel: text().notNull(),
  sentAt: tstz().notNull().defaultNow(),
  ...timestamps,
});

export const cashflows = pgTable('cashflows', {
  id: id(),
  firmId: uuid()
    .notNull()
    .references(() => firms.id),
  accountId: uuid().references(() => accounts.id),
  kind: cashflowKind().notNull(),
  /** Fees negative, payouts positive. */
  amountUsd: money().notNull(),
  occurredAt: tstz().notNull(),
  externalRef: text().notNull().unique(),
  raw: jsonb(),
  ...timestamps,
});
