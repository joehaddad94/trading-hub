import { type CashflowKind, type MoneySummary, moneySummary } from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, eq, inArray, like } from '@trading/db/orm';
import { accounts, cashflows, firms } from '@trading/db/schema';
import type { ResolvedScope } from './scope';

const MANUAL_PREFIX = 'manual:';

export type CashflowRow = {
  id: string;
  kind: CashflowKind;
  amountUsd: string;
  occurredAt: Date;
  account: { login: number; phase: string } | null;
  /** List price and discount when the firm's payment row has them (e.g. a 100% discount account). */
  listPrice: string | null;
  discount: string | null;
  note: string | null;
  manual: boolean;
};

export type MoneyData = { summary: MoneySummary; rows: CashflowRow[]; firmLevel: boolean };

const str = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? String(v) : null);

/**
 * Money (§8.3 screen 9): fees, resets and payouts in scope with the running net. Cashflows not tied to an
 * account (firm-level) are only counted in the all-accounts scope.
 */
export async function money(db: Executor, scope: ResolvedScope | null): Promise<MoneyData> {
  const all = scope === null || scope.scope.kind === 'all';
  if (!all && scope.accountIds.length === 0) return { summary: moneySummary([]), rows: [], firmLevel: false };
  const where = all ? undefined : inArray(cashflows.accountId, scope.accountIds);
  const rows = await db
    .select({
      id: cashflows.id,
      kind: cashflows.kind,
      amountUsd: cashflows.amountUsd,
      occurredAt: cashflows.occurredAt,
      externalRef: cashflows.externalRef,
      raw: cashflows.raw,
      login: accounts.login,
      phase: accounts.phase,
    })
    .from(cashflows)
    .leftJoin(accounts, eq(accounts.id, cashflows.accountId))
    .where(where)
    .orderBy(asc(cashflows.occurredAt));
  const mapped: CashflowRow[] = rows.map((r) => {
    const raw = (r.raw ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      kind: r.kind,
      amountUsd: r.amountUsd,
      occurredAt: r.occurredAt,
      account: r.login === null || r.phase === null ? null : { login: r.login, phase: r.phase },
      listPrice: str(raw.total),
      discount: str(raw.discount),
      note: str(raw.note),
      manual: r.externalRef.startsWith(MANUAL_PREFIX),
    };
  });
  return { summary: moneySummary(mapped), rows: mapped, firmLevel: all };
}

export type ManualCashflow = {
  kind: CashflowKind;
  /** Signed: fees negative, payouts and refunds positive. */
  amountUsd: string;
  occurredAt: Date;
  accountId: string | null;
  note: string | null;
};

/** A cashflow the exports don't carry (e.g. a payout before its shape is verified, a fee paid elsewhere). */
export async function addManualCashflow(db: Executor, input: ManualCashflow): Promise<string> {
  const [account] = input.accountId
    ? await db.select({ firmId: accounts.firmId }).from(accounts).where(eq(accounts.id, input.accountId))
    : [];
  const [firm] = account ? [{ id: account.firmId }] : await db.select({ id: firms.id }).from(firms).limit(1);
  if (!firm) throw new Error('No firm yet: import an export first.');
  const [row] = await db
    .insert(cashflows)
    .values({
      firmId: firm.id,
      accountId: input.accountId,
      kind: input.kind,
      amountUsd: input.amountUsd,
      occurredAt: input.occurredAt,
      externalRef: `${MANUAL_PREFIX}${crypto.randomUUID()}`,
      raw: input.note ? { note: input.note } : null,
    })
    .returning({ id: cashflows.id });
  if (!row) throw new Error('cashflow not added');
  return row.id;
}

/** Only hand-entered cashflows can be deleted; imported ones are the firm's record. */
export async function deleteManualCashflow(db: Executor, id: string): Promise<boolean> {
  const deleted = await db
    .delete(cashflows)
    .where(and(eq(cashflows.id, id), like(cashflows.externalRef, `${MANUAL_PREFIX}%`)))
    .returning({ id: cashflows.id });
  return deleted.length > 0;
}
