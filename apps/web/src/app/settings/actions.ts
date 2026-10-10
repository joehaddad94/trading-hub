'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { tagSchema } from '@/modules/tracker/journal/schema';
import { removeTag, writeTag, writeTagName } from '@/modules/tracker/server/journal';
import {
  saveAccountRisk,
  saveDayAndScratch,
  savePreviousPhase,
  saveSymbolSpec,
} from '@/modules/tracker/server/settings-admin';

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

const previousPhase = z.object({
  id: z.uuid(),
  parentId: z.union([z.uuid(), z.literal('')]).transform((v) => v || null),
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

export async function createTagAction(_prev: Result | null, form: FormData): Promise<Result> {
  const parsed = tagSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(async () => {
    await writeTag(parsed.data.name, parsed.data.kind);
    return 'Tag added.';
  });
}

const tagEdit = z.object({
  id: z.uuid(),
  name: tagSchema.shape.name,
  intent: z.enum(['rename', 'delete']),
});

/** Rename or delete a tag. Deleting removes it from every trade's journal; trades themselves are untouched. */
export async function editTagAction(_prev: Result | null, form: FormData): Promise<Result> {
  const parsed = tagEdit.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(async () => {
    if (parsed.data.intent === 'delete') {
      await removeTag(parsed.data.id);
      return 'Tag deleted.';
    }
    await writeTagName(parsed.data.id, parsed.data.name);
    return 'Renamed.';
  });
}

/** Links an account to the phase it came from, so P1 → P2 → Funded shows as one journey. */
export async function savePreviousPhaseAction(_prev: Result | null, form: FormData): Promise<Result> {
  const parsed = previousPhase.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  try {
    const res = await savePreviousPhase(parsed.data);
    if (!res.ok) return res;
    revalidatePath('/', 'layout');
    return { ok: true, data: parsed.data.parentId ? 'Linked.' : 'Unlinked.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Saving failed; it was reported.' };
  }
}
