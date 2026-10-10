import 'server-only';
import { asc, eq } from '@trading/db/orm';
import { accounts, firms, symbolSpecs } from '@trading/db/schema';
import { refreshTradeRisk } from '@trading/importer/server';
import { type DayPreset, saveTrackerSettings, setPreviousPhase } from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';

function db() {
  const d = getDb();
  if (!d) throw new Error('The database is not configured.');
  return d;
}

export async function listSymbolSpecs() {
  const d = getDb();
  if (!d) return [];
  return d
    .select({
      id: symbolSpecs.id,
      firm: firms.name,
      symbol: symbolSpecs.symbol,
      pointValuePerLot: symbolSpecs.pointValuePerLot,
      verified: symbolSpecs.verified,
    })
    .from(symbolSpecs)
    .innerJoin(firms, eq(firms.id, symbolSpecs.firmId))
    .orderBy(asc(firms.name), asc(symbolSpecs.symbol));
}

export async function listAccountRisk() {
  const d = getDb();
  if (!d) return [];
  return d
    .select({
      id: accounts.id,
      login: accounts.login,
      phase: accounts.phase,
      defaultRiskPct: accounts.defaultRiskPct,
      parentAccountId: accounts.parentAccountId,
    })
    .from(accounts)
    .where(eq(accounts.isBacktest, false))
    .orderBy(asc(accounts.firstSeenAt));
}

async function refreshAllRisk() {
  const d = db();
  const ids = await d.select({ id: accounts.id }).from(accounts);
  return refreshTradeRisk(
    d,
    ids.map((r) => r.id),
  );
}

export async function saveDayAndScratch(input: { dayPreset: DayPreset; scratchThresholdR: string }) {
  await saveTrackerSettings(db(), input);
}

/** Point values change R for every trade on that symbol, so risk is re-resolved afterwards. */
export async function saveSymbolSpec(input: { id: string; pointValuePerLot: string; verified: boolean }) {
  await db()
    .update(symbolSpecs)
    .set({ pointValuePerLot: input.pointValuePerLot, verified: input.verified })
    .where(eq(symbolSpecs.id, input.id));
  return refreshAllRisk();
}

export async function saveAccountRisk(input: { id: string; defaultRiskPct: string }) {
  await db().update(accounts).set({ defaultRiskPct: input.defaultRiskPct }).where(eq(accounts.id, input.id));
  return refreshAllRisk();
}

export function savePreviousPhase(input: { id: string; parentId: string | null }) {
  return setPreviousPhase(db(), input.id, input.parentId);
}
