'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { type RiskTagInput, riskTagSchema } from '@/modules/tracker/journal/schema';
import { JournalError, writeTradeRisk } from '@/modules/tracker/server/journal';

/** Risk queue: tags (or clears) the % risked on one trade, which replaces its estimated R. */
export async function tagRiskAction(input: RiskTagInput): Promise<ActionResult<null>> {
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
