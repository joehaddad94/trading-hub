import { pgEnum } from 'drizzle-orm/pg-core';

export const accountPhase = pgEnum('account_phase', ['p1', 'p2', 'funded', 'instant', 'other']);

/** Tracker spec §5.1. */
export const accountStatus = pgEnum('account_status', [
  'active',
  'passed',
  'breached',
  'merged',
  'paused',
  'closed_other',
  'missing',
]);

export const statusSource = pgEnum('status_source', ['firm_history', 'detected_on_import']);

export const tradeSource = pgEnum('trade_source', ['live', 'backtest']);

export const tradeSide = pgEnum('trade_side', ['buy', 'sell']);

/** Tracker spec §6 — how a trade's risk was resolved. */
export const riskSource = pgEnum('risk_source', ['journal_sl', 'journal_usd', 'full_stop_loss', 'estimated']);

export const cashflowKind = pgEnum('cashflow_kind', [
  'challenge_fee',
  'reset_fee',
  'addon',
  'payout',
  'refund',
  'other',
]);

export const tagKind = pgEnum('tag_kind', ['setup', 'mistake', 'context']);

export const importResult = pgEnum('import_result', ['ok', 'partial', 'failed', 'rejected']);
