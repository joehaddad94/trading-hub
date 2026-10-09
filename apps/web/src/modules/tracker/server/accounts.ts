import 'server-only';
import { accountDetail, groupJourneys, listAccounts, phaseComparison, resolveScope } from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';
import { getSettings } from './settings';

export async function getJourneys() {
  const db = getDb();
  if (!db) return null;
  return groupJourneys(await listAccounts(db, await getSettings()));
}

export async function getAccountDetail(login: number) {
  const db = getDb();
  if (!db) return null;
  return accountDetail(db, login, new Date(), await getSettings());
}

export async function getPhaseComparison() {
  const db = getDb();
  if (!db) return null;
  return phaseComparison(db, await getSettings());
}

/** The scope of one account, for the account page's Calendar and Trades tabs. */
export async function getAccountScope(login: number) {
  const db = getDb();
  if (!db) return null;
  return resolveScope(db, { kind: 'account', login: String(login) });
}
