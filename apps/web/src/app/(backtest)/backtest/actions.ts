'use server';

import { type SessionInput, sessionInputSchema } from '@trading/backtest';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import {
  createBacktestSession,
  deleteBacktestSession,
  setBacktestSessionStatus,
  updateBacktestSession,
} from '@/modules/backtest/server/sessions';

const COST_FIELDS = { spread: 'spreadPoints', commission: 'commissionPerLot', slippage: 'slippagePoints' } as const;

/** Form → session input. Costs: an instrument is stored only when one of its fields is filled. */
function readSession(form: FormData) {
  const costs: Record<string, Record<string, string>> = {};
  for (const [key, value] of form.entries()) {
    const m = /^cost_([A-Z0-9]{2,12})_(spread|commission|slippage)$/.exec(key);
    if (!m || typeof value !== 'string' || value.trim() === '') continue;
    const [, code, field] = m as unknown as [string, string, keyof typeof COST_FIELDS];
    costs[code] = { ...costs[code], [COST_FIELDS[field]]: value };
  }
  const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return sessionInputSchema.safeParse({
    name: form.get('name') ?? '',
    startingBalance: form.get('startingBalance') ?? '',
    riskPct: form.get('riskPct') ?? '',
    costs: Object.fromEntries(
      Object.entries(costs).map(([code, c]) => [
        code,
        {
          spreadPoints: c.spreadPoints ?? '',
          commissionPerLot: c.commissionPerLot ?? '',
          slippagePoints: c.slippagePoints ?? '',
        },
      ]),
    ),
    setupTagId: blank(form.get('setupTagId')),
    notes: blank(form.get('notes')),
  });
}

const fail = (error: z.ZodError) => ({ ok: false as const, error: z.prettifyError(error) });

/** Backtester spec §7: new session. Opens the chart on it. */
export async function createSessionAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const parsed = readSession(form);
  if (!parsed.success) return fail(parsed.error);
  const result = await createBacktestSession(parsed.data satisfies SessionInput);
  if (!result.ok) return result;
  revalidatePath('/backtest');
  redirect(`/backtest/chart?session=${result.data.id}`);
}

/** Edits a session's name, balance, risk, costs, setup tag and notes. */
export async function updateSessionAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) return fail(id.error);
  const parsed = readSession(form);
  if (!parsed.success) return fail(parsed.error);
  const result = await updateBacktestSession(id.data, parsed.data);
  if (!result.ok) return result;
  revalidatePath('/backtest');
  revalidatePath(`/backtest/sessions/${id.data}`);
  return { ok: true, data: 'Saved.' };
}

/** Complete (cancels open orders) or reopen a session. */
export async function sessionStatusAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(['in_progress', 'completed']) })
    .safeParse({ id: form.get('id'), status: form.get('status') });
  if (!parsed.success) return fail(parsed.error);
  const result = await setBacktestSessionStatus(parsed.data.id, parsed.data.status);
  if (!result.ok) return result;
  revalidatePath('/backtest');
  revalidatePath(`/backtest/sessions/${parsed.data.id}`);
  return { ok: true, data: parsed.data.status === 'completed' ? 'Session completed.' : 'Session reopened.' };
}

/** Spec §6.4: deletes a session with its synthetic account, trades, orders and drawings (never live data). */
export async function deleteSessionAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) return fail(id.error);
  if (form.get('confirm') !== 'delete') return { ok: false, error: 'Confirm the delete first.' };
  const result = await deleteBacktestSession(id.data);
  if (!result.ok) return result;
  revalidatePath('/backtest');
  redirect('/backtest');
}
