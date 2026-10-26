'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { ownerOnly } from '@/lib/server/viewer';
import {
  type QuickJournalInput,
  quickJournalSchema,
  type RiskTagInput,
  riskTagSchema,
} from '@/modules/tracker/journal/schema';
import { JournalError, writeQuickJournal, writeTradeRisk } from '@/modules/tracker/server/journal';

/** Risk queue: tags (or clears) the % risked on one trade, which replaces its estimated R. */
export async function tagRiskAction(input: RiskTagInput): Promise<ActionResult<null>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = riskTagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { tradeId, pct } = parsed.data;
  try {
    await writeTradeRisk(tradeId, pct);
    revalidatePath('/tracker', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof JournalError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Saving the risk failed; it was reported.' };
  }
}

/** Quick journal card: plan, setup and optional initial SL for one unjournaled trade. */
export async function quickJournalAction(input: QuickJournalInput): Promise<ActionResult<null>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = quickJournalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { tradeId, ...quick } = parsed.data;
  try {
    await writeQuickJournal(tradeId, quick);
    revalidatePath('/tracker', 'layout');
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof JournalError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Saving the journal failed; it was reported.' };
  }
}
