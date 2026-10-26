'use server';

import { TZDate } from '@date-fns/tz';
import * as Sentry from '@sentry/nextjs';
import Decimal from 'decimal.js';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { DISPLAY_TZ } from '@/lib/format';
import { ownerOnly } from '@/lib/server/viewer';
import { removeManualCashflow, writeManualCashflow } from '@/modules/tracker/server/money';

/** Kinds that bring money in; everything else is a cost and stored negative (tracker spec §5). */
const INFLOWS = new Set(['payout', 'refund']);

const cashflow = z.object({
  kind: z.enum(['challenge_fee', 'reset_fee', 'addon', 'payout', 'refund', 'other']),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter an amount like 99 or 1500.25.')
    .refine((v) => new Decimal(v).gt(0), 'Must be above 0.'),
  date: z.iso.date(),
  accountId: z.union([z.uuid(), z.literal('')]).transform((v) => v || null),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

/** Money (§8.3 screen 9): a cashflow the exports don't carry, entered by hand. */
export async function addCashflowAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = cashflow.safeParse({
    kind: form.get('kind'),
    amount: form.get('amount') ?? '',
    date: form.get('date'),
    accountId: form.get('accountId') ?? '',
    note: form.get('note') ?? '',
  });
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { kind, amount, date, accountId, note } = parsed.data;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  try {
    await writeManualCashflow({
      kind,
      amountUsd: INFLOWS.has(kind) ? amount : new Decimal(amount).negated().toFixed(),
      occurredAt: new Date(new TZDate(y, m - 1, d, 12, 0, 0, DISPLAY_TZ).getTime()),
      accountId,
      note,
    });
    revalidatePath('/tracker', 'layout');
    return { ok: true, data: 'Added.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Adding failed; it was reported.' };
  }
}

export async function deleteCashflowAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) return { ok: false, error: 'Unknown cashflow.' };
  try {
    const deleted = await removeManualCashflow(id.data);
    revalidatePath('/tracker', 'layout');
    return deleted ? { ok: true, data: 'Deleted.' } : { ok: false, error: 'Only hand-entered rows can be deleted.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Deleting failed; it was reported.' };
  }
}
