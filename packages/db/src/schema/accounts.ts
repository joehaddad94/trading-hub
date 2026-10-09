import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, money, timestamps, tstz } from './_shared';
import { accountPhase, accountStatus, statusSource } from './enums';

export const firms = pgTable('firms', {
  id: id(),
  name: text().notNull().unique(),
  ...timestamps,
});

/** Never deleted (CLAUDE.md rule 2) — enforced by a trigger. */
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    firmId: uuid()
      .notNull()
      .references(() => firms.id),
    externalId: bigint({ mode: 'number' }).notNull(),
    login: bigint({ mode: 'number' }).notNull(),
    parentAccountId: uuid().references((): AnyPgColumn => accounts.id),
    phase: accountPhase().notNull().default('other'),
    isDemo: boolean().notNull().default(true),
    platform: text(),
    typeLabel: text(),
    planRaw: jsonb(),
    startingBalance: money().notNull(),
    status: accountStatus().notNull().default('active'),
    statusReason: text(),
    statusChangedAt: tstz(),
    defaultRiskPct: numeric({ precision: 5, scale: 2 }).notNull().default('0.5'),
    firstSeenAt: tstz().notNull().defaultNow(),
    lastSeenAt: tstz().notNull().defaultNow(),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [uniqueIndex('accounts_firm_external_id_key').on(t.firmId, t.externalId), index().on(t.login)],
);

export const accountStatusHistory = pgTable(
  'account_status_history',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    status: accountStatus().notNull(),
    statusReason: text(),
    changedAt: tstz().notNull(),
    source: statusSource().notNull(),
    raw: jsonb(),
    ...timestamps,
  },
  (t) => [uniqueIndex('account_status_history_dedupe_key').on(t.accountId, t.source, t.changedAt, t.status)],
);

export const cycles = pgTable(
  'cycles',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    externalId: bigint({ mode: 'number' }).notNull().unique(),
    reason: text(),
    startedAt: tstz(),
    endsAt: tstz(),
    statsRaw: jsonb(),
    ...timestamps,
  },
  (t) => [index().on(t.accountId)],
);

export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    takenAt: tstz().notNull(),
    balance: money().notNull(),
    equity: money(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.accountId, t.takenAt)],
);

/** Exact limits come from firm data, never hard-coded (tracker spec §5). Percentages as the firm reports them. */
export const ruleSnapshots = pgTable(
  'rule_snapshots',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    takenAt: tstz().notNull(),
    dailyLossLimit: numeric({ precision: 6, scale: 2 }),
    maxLossLimit: numeric({ precision: 6, scale: 2 }),
    profitTarget: numeric({ precision: 6, scale: 2 }),
    raw: jsonb(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.accountId, t.takenAt)],
);

export const symbolSpecs = pgTable(
  'symbol_specs',
  {
    id: id(),
    firmId: uuid()
      .notNull()
      .references(() => firms.id),
    symbol: text().notNull(),
    pointValuePerLot: numeric({ precision: 12, scale: 4 }).notNull(),
    verified: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.firmId, t.symbol)],
);
