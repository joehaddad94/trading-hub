'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { ownerOnly } from '@/lib/server/viewer';
import { writeAccountRestriction, writeNewsSettings } from '@/modules/news/server/news';

const minutes = z.coerce.number().int('Whole minutes').min(0).max(120);

const settings = z.object({
  minutesBefore: minutes,
  minutesAfter: minutes,
  currencies: z
    .string()
    .transform((v) =>
      v
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().regex(/^[A-Z]{3}$/, 'Currencies are 3-letter codes like USD'))
        .min(1)
        .max(20),
    ),
});

/** Restriction window and counted currencies (news spec §5). */
export async function saveNewsRulesAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = settings.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  try {
    await writeNewsSettings({ ...parsed.data, currencies: [...new Set(parsed.data.currencies)] });
    revalidatePath('/', 'layout');
    return { ok: true, data: 'Saved.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Saving failed; it was reported.' };
  }
}

const accountSetting = z.object({ accountId: z.uuid(), value: z.enum(['default', 'on', 'off']) });

/** Per-account restriction badges (news spec §5): default follows phase and the News Trading add-on. */
export async function saveAccountRestrictionAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = accountSetting.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { accountId, value } = parsed.data;
  try {
    await writeAccountRestriction(accountId, value === 'default' ? null : value === 'on');
    revalidatePath('/', 'layout');
    return { ok: true, data: 'Saved.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Saving failed; it was reported.' };
  }
}
