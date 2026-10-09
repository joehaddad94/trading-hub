'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { saveAccountRisk, saveDayAndScratch, saveSymbolSpec } from '@/modules/tracker/server/settings-admin';

const decimal = (max: number, scale: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{1,${max}}(\\.\\d{1,${scale}})?$`), 'Enter a positive number.');

const general = z.object({
  dayPreset: z.enum(['beirut', 'ny17']),
  scratchThresholdR: decimal(1, 3).refine((v) => Number(v) < 1, 'Must be below 1R.'),
});
const symbol = z.object({
  id: z.uuid(),
  pointValuePerLot: decimal(8, 4).refine((v) => Number(v) > 0, 'Must be above 0.'),
  verified: z.literal('on').optional(),
});
const risk = z.object({
  id: z.uuid(),
  defaultRiskPct: decimal(2, 2).refine((v) => Number(v) > 0 && Number(v) <= 10, 'Between 0 and 10%.'),
});

type Result = ActionResult<string>;

async function run(work: () => Promise<string>): Promise<Result> {
  try {
    const message = await work();
    revalidatePath('/', 'layout');
    return { ok: true, data: message };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Saving failed; it was reported.' };
  }
}

export async function saveGeneralSettings(_prev: Result | null, form: FormData): Promise<Result> {
  const parsed = general.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(async () => {
    await saveDayAndScratch(parsed.data);
    return 'Saved.';
  });
}

export async function saveSymbolSpecAction(_prev: Result | null, form: FormData): Promise<Result> {
  const parsed = symbol.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(async () => {
    const n = await saveSymbolSpec({ ...parsed.data, verified: parsed.data.verified === 'on' });
    return `Saved. Risk re-resolved on ${n} trades.`;
  });
}

export async function saveAccountRiskAction(_prev: Result | null, form: FormData): Promise<Result> {
  const parsed = risk.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(async () => {
    const n = await saveAccountRisk(parsed.data);
    return `Saved. Risk re-resolved on ${n} trades.`;
  });
}
