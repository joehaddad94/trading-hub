'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { ownerOnly } from '@/lib/server/viewer';
import { writeDailyNote } from '@/modules/tracker/server/calendar';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v));

const dailyNote = z.object({
  date: z.iso.date(),
  notes: optionalText(5000),
  mood: optionalText(100),
  marketContext: optionalText(1000),
});

/** Day view daily note (§8.2): create or edit inline. */
export async function saveDailyNoteAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = dailyNote.safeParse({
    date: form.get('date'),
    notes: form.get('notes') ?? '',
    mood: form.get('mood') ?? '',
    marketContext: form.get('marketContext') ?? '',
  });
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { date, ...note } = parsed.data;
  try {
    await writeDailyNote(date, note);
    revalidatePath('/tracker/calendar');
    revalidatePath('/tracker');
    return { ok: true, data: 'Note saved.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Saving the note failed; it was reported.' };
  }
}
