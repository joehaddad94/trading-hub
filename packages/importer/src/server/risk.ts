import { median, type RiskSource, resolveRisk } from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, eq, inArray, sql } from '@trading/db/orm';
import { accounts, journalEntries, symbolSpecs, tradeRisk, trades } from '@trading/db/schema';
import Decimal from 'decimal.js';

/**
 * `reason_code` values meaning "closed by stop loss". Empty until verified from real data (tracker spec §6
 * step 3, blocker log) — so no trade resolves to `full_stop_loss` yet and estimates fall back to % of balance.
 */
export const STOP_LOSS_REASON_CODES: ReadonlySet<number> = new Set();

const TRAILING_MS = 30 * 24 * 3600_000;

/**
 * Re-resolves and stores `risk_usd` / `risk_source` for every trade of these accounts (§6). Runs after each
 * import and after journal edits; only rows whose risk changed are written.
 */
export async function refreshTradeRisk(db: Executor, accountIds: string[]): Promise<number> {
  if (accountIds.length === 0) return 0;
  const rows = await db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      side: trades.side,
      openPrice: trades.openPrice,
      lots: trades.lots,
      netProfit: trades.netProfit,
      slFinal: trades.slFinal,
      reasonCode: trades.reasonCode,
      closedAt: trades.closedAt,
      riskUsd: trades.riskUsd,
      riskSource: trades.riskSource,
      initialSl: journalEntries.initialSl,
      plannedRiskUsd: journalEntries.plannedRiskUsd,
      journalId: journalEntries.id,
      taggedRiskUsd: tradeRisk.riskUsd,
      pointValuePerLot: symbolSpecs.pointValuePerLot,
      startingBalance: accounts.startingBalance,
      defaultRiskPct: accounts.defaultRiskPct,
    })
    .from(trades)
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .leftJoin(tradeRisk, eq(tradeRisk.tradeId, trades.id))
    .leftJoin(
      symbolSpecs,
      and(
        eq(symbolSpecs.firmId, accounts.firmId),
        eq(symbolSpecs.symbol, trades.symbol),
        eq(symbolSpecs.verified, true),
      ),
    )
    .where(and(inArray(trades.accountId, accountIds), eq(trades.source, 'live')))
    .orderBy(asc(trades.accountId), asc(trades.closedAt), asc(trades.ticket));

  const fullStops = new Map<string, { at: number; risk: string }[]>();
  const changed: { id: string; riskUsd: string; source: RiskSource }[] = [];
  for (const t of rows) {
    const history = fullStops.get(t.accountId) ?? [];
    const at = t.closedAt.getTime();
    const trailing = history.filter((h) => h.at >= at - TRAILING_MS && h.at < at).map((h) => h.risk);
    const resolved = resolveRisk(
      {
        side: t.side,
        openPrice: t.openPrice,
        lots: t.lots,
        netProfit: t.netProfit,
        slFinal: t.slFinal,
        reasonCode: t.reasonCode,
        journal: t.journalId ? { initialSl: t.initialSl, plannedRiskUsd: t.plannedRiskUsd } : null,
        taggedRiskUsd: t.taggedRiskUsd,
        pointValuePerLot: t.pointValuePerLot,
      },
      {
        stopLossReasonCodes: STOP_LOSS_REASON_CODES,
        trailingFullStopMedian: median(trailing),
        startingBalance: t.startingBalance,
        defaultRiskPct: t.defaultRiskPct,
      },
    );
    if (resolved.source === 'full_stop_loss') {
      history.push({ at, risk: resolved.riskUsd });
      fullStops.set(t.accountId, history);
    }
    if (!sameRisk(t, resolved)) changed.push({ id: t.id, riskUsd: resolved.riskUsd, source: resolved.source });
  }

  // One statement per chunk: a first import changes every trade, and each statement is a round trip.
  for (let i = 0; i < changed.length; i += UPDATE_CHUNK) {
    const values = sql.join(
      changed.slice(i, i + UPDATE_CHUNK).map((c) => sql`(${c.id}::uuid, ${c.riskUsd}::numeric, ${c.source})`),
      sql`, `,
    );
    await db.execute(sql`
      update trades set risk_usd = v.risk_usd, risk_source = v.risk_source::risk_source
      from (values ${values}) as v(id, risk_usd, risk_source)
      where trades.id = v.id`);
  }
  return changed.length;
}

const UPDATE_CHUNK = 500;

function sameRisk(
  t: { riskUsd: string | null; riskSource: RiskSource | null },
  r: { riskUsd: string; source: RiskSource },
) {
  return t.riskSource === r.source && t.riskUsd !== null && new Decimal(t.riskUsd).eq(r.riskUsd);
}
