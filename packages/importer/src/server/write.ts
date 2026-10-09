import type { Database } from '@trading/db';
import { and, eq, isNull, lt, notInArray, sql } from '@trading/db/orm';
import {
  accountStatusHistory,
  accounts,
  balanceSnapshots,
  cashflows,
  cycles,
  firms,
  ruleSnapshots,
  trades,
} from '@trading/db/schema';
import type { ImportPlan, PlannedAccount } from '../plan';
import { refreshTradeRisk } from './risk';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Db = Database | Tx;

export type WriteSummary = {
  accounts: number;
  trades: number;
  cycles: number;
  cashflows: number;
  statusChanges: number;
  markedMissing: number[];
};

/**
 * Applies an import plan in one transaction. Idempotent: every write is an upsert on a natural key,
 * so applying the same plan twice leaves the same rows. An older file never overwrites newer account state.
 */
export async function applyImportPlan(db: Db, plan: ImportPlan): Promise<WriteSummary> {
  return db.transaction(async (tx) => {
    const firmId = await ensureFirm(tx, plan.firm);
    const summary: WriteSummary = {
      accounts: 0,
      trades: 0,
      cycles: 0,
      cashflows: 0,
      statusChanges: 0,
      markedMissing: [],
    };
    const idsByExternal = new Map<number, string>();

    for (const account of plan.accounts) {
      const { id, statusChanged } = await upsertAccount(tx, firmId, account, plan.generatedAt);
      idsByExternal.set(account.externalId, id);
      summary.accounts += 1;
      if (statusChanged) summary.statusChanges += 1;

      for (const h of account.firmStatusHistory) {
        await tx
          .insert(accountStatusHistory)
          .values({
            accountId: id,
            status: h.status,
            statusReason: h.statusReason,
            changedAt: h.changedAt,
            source: 'firm_history',
            raw: h.raw,
          })
          .onConflictDoNothing();
      }

      const cycleIds = new Map<number, string>();
      for (const c of account.cycles) {
        const [row] = await tx
          .insert(cycles)
          .values({
            accountId: id,
            externalId: c.externalId,
            reason: c.reason,
            startedAt: c.startedAt,
            endsAt: c.endsAt,
            statsRaw: c.statsRaw,
          })
          .onConflictDoUpdate({
            target: cycles.externalId,
            set: { reason: c.reason, startedAt: c.startedAt, endsAt: c.endsAt, statsRaw: c.statsRaw },
          })
          .returning({ id: cycles.id });
        if (row) cycleIds.set(c.externalId, row.id);
        summary.cycles += 1;
      }

      for (const t of account.trades) {
        const values = {
          cycleId: cycleIds.get(t.cycleExternalId) ?? null,
          symbol: t.symbol,
          side: t.side,
          lots: t.lots,
          volume: t.volume,
          openPrice: t.openPrice,
          closePrice: t.closePrice,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
          slFinal: t.slFinal,
          tpFinal: t.tpFinal,
          profit: t.profit,
          commission: t.commission,
          swap: t.swap,
          firmRrRaw: t.firmRrRaw,
          firmRr: t.firmRr,
          isNews: t.isNews,
          reasonCode: t.reasonCode,
          raw: t.raw,
        };
        await tx
          .insert(trades)
          .values({ accountId: id, source: 'live', ticket: t.ticket, ...values })
          .onConflictDoUpdate({ target: [trades.accountId, trades.ticket], set: values });
        summary.trades += 1;
      }

      await tx
        .insert(balanceSnapshots)
        .values({ accountId: id, takenAt: plan.generatedAt, balance: account.balance, equity: account.equity })
        .onConflictDoUpdate({
          target: [balanceSnapshots.accountId, balanceSnapshots.takenAt],
          set: { balance: account.balance, equity: account.equity },
        });

      if (account.rules) {
        const rules = {
          dailyLossLimit: account.rules.dailyLossLimit,
          maxLossLimit: account.rules.maxLossLimit,
          profitTarget: account.rules.profitTarget,
          raw: account.rules.raw,
        };
        await tx
          .insert(ruleSnapshots)
          .values({ accountId: id, takenAt: plan.generatedAt, ...rules })
          .onConflictDoUpdate({ target: [ruleSnapshots.accountId, ruleSnapshots.takenAt], set: rules });
      }
    }

    // Parent links are inferred by the producer; a link Joe set by hand is never overwritten.
    for (const account of plan.accounts) {
      const childId = idsByExternal.get(account.externalId);
      const parentId = account.parentExternalId === null ? undefined : idsByExternal.get(account.parentExternalId);
      if (childId && parentId) {
        await tx
          .update(accounts)
          .set({ parentAccountId: parentId })
          .where(and(eq(accounts.id, childId), isNull(accounts.parentAccountId)));
      }
    }

    const loginToId = await accountIdsByLogin(tx, firmId);
    for (const c of plan.cashflows) {
      const values = {
        firmId,
        accountId: c.accountLogin === null ? null : (loginToId.get(c.accountLogin) ?? null),
        kind: c.kind,
        amountUsd: c.amountUsd,
        occurredAt: c.occurredAt,
        raw: c.raw,
      };
      await tx
        .insert(cashflows)
        .values({ externalRef: c.externalRef, ...values })
        .onConflictDoUpdate({ target: cashflows.externalRef, set: values });
      summary.cashflows += 1;
    }

    if (plan.fileStatus === 'ok') summary.markedMissing = await markMissing(tx, firmId, plan);
    await refreshTradeRisk(tx, [...idsByExternal.values()]);

    return summary;
  });
}

async function ensureFirm(tx: Tx, name: string): Promise<string> {
  await tx.insert(firms).values({ name }).onConflictDoNothing();
  const [row] = await tx.select({ id: firms.id }).from(firms).where(eq(firms.name, name));
  if (!row) throw new Error(`Firm ${name} missing after insert`);
  return row.id;
}

async function upsertAccount(
  tx: Tx,
  firmId: string,
  a: PlannedAccount,
  seenAt: Date,
): Promise<{ id: string; statusChanged: boolean }> {
  const [existing] = await tx
    .select({ id: accounts.id, status: accounts.status, lastSeenAt: accounts.lastSeenAt })
    .from(accounts)
    .where(and(eq(accounts.firmId, firmId), eq(accounts.externalId, a.externalId)));

  const fields = {
    login: a.login,
    phase: a.phase,
    isDemo: a.isDemo,
    platform: a.platform,
    typeLabel: a.typeLabel,
    planRaw: a.planRaw,
    startingBalance: a.startingBalance,
    status: a.status,
    statusReason: a.statusReason,
  };

  if (!existing) {
    const [row] = await tx
      .insert(accounts)
      .values({
        firmId,
        externalId: a.externalId,
        ...fields,
        statusChangedAt: seenAt,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        closedAt: a.status === 'active' ? null : seenAt,
      })
      .returning({ id: accounts.id });
    if (!row) throw new Error(`Account ${a.login} insert returned nothing`);
    await tx
      .insert(accountStatusHistory)
      .values({
        accountId: row.id,
        status: a.status,
        statusReason: a.statusReason,
        changedAt: seenAt,
        source: 'detected_on_import',
      })
      .onConflictDoNothing();
    return { id: row.id, statusChanged: false };
  }

  // An older file (e.g. reprocessing) must not roll an account back.
  if (existing.lastSeenAt > seenAt) return { id: existing.id, statusChanged: false };

  const statusChanged = existing.status !== a.status;
  await tx
    .update(accounts)
    .set({
      ...fields,
      lastSeenAt: seenAt,
      ...(statusChanged ? { statusChangedAt: seenAt, closedAt: a.status === 'active' ? null : seenAt } : {}),
    })
    .where(eq(accounts.id, existing.id));

  if (statusChanged) {
    await tx
      .insert(accountStatusHistory)
      .values({
        accountId: existing.id,
        status: a.status,
        statusReason: a.statusReason,
        changedAt: seenAt,
        source: 'detected_on_import',
      })
      .onConflictDoNothing();
  }
  return { id: existing.id, statusChanged };
}

async function accountIdsByLogin(tx: Tx, firmId: string): Promise<Map<number, string>> {
  const rows = await tx
    .select({ id: accounts.id, login: accounts.login })
    .from(accounts)
    .where(eq(accounts.firmId, firmId));
  return new Map(rows.map((r) => [r.login, r.id]));
}

/** Tracker spec §5.1 `missing`: seen before, absent from a complete newer export, no known status change. */
async function markMissing(tx: Tx, firmId: string, plan: ImportPlan): Promise<number[]> {
  const present = plan.accounts.map((a) => a.externalId);
  const gone = await tx
    .update(accounts)
    .set({ status: 'missing', statusChangedAt: plan.generatedAt })
    .where(
      and(
        eq(accounts.firmId, firmId),
        lt(accounts.lastSeenAt, plan.generatedAt),
        notInArray(accounts.status, ['missing']),
        present.length > 0 ? notInArray(accounts.externalId, present) : sql`true`,
      ),
    )
    .returning({ id: accounts.id, login: accounts.login });
  if (gone.length > 0) {
    await tx
      .insert(accountStatusHistory)
      .values(
        gone.map((g) => ({
          accountId: g.id,
          status: 'missing' as const,
          statusReason: 'Absent from the latest export',
          changedAt: plan.generatedAt,
          source: 'detected_on_import' as const,
        })),
      )
      .onConflictDoNothing();
  }
  return gone.map((g) => g.login);
}
