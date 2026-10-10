import 'server-only';
import {
  addManualCashflow,
  deleteManualCashflow,
  listScopeAccounts,
  type ManualCashflow,
  money,
  type ResolvedScope,
} from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';

export async function getMoney(scope: ResolvedScope) {
  const db = getDb();
  return db ? money(db, scope) : null;
}

/** Accounts for the "add cashflow" account picker (every account, not just the scope). */
export async function getCashflowAccounts() {
  const db = getDb();
  return db ? listScopeAccounts(db) : [];
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('The database is not configured.');
  return db;
}

export async function writeManualCashflow(input: ManualCashflow) {
  return addManualCashflow(requireDb(), input);
}

export async function removeManualCashflow(id: string) {
  return deleteManualCashflow(requireDb(), id);
}
