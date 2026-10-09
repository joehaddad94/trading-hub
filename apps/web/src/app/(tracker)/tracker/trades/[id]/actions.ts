'use server';

import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { type JournalFormInput, journalSchema } from '@/modules/tracker/journal/schema';
import {
  detachScreenshot,
  finishScreenshotUpload,
  getNextUnjournaled,
  JournalError,
  startScreenshotUpload,
  writeTradeJournal,
} from '@/modules/tracker/server/journal';
import { SCREENSHOT_MAX_BYTES, SCREENSHOT_TYPES } from '@/modules/tracker/server/storage';

function revalidateTracker(tradeId: string) {
  revalidatePath(`/tracker/trades/${tradeId}`);
  revalidatePath('/tracker', 'layout');
}

/** Journal form (§8.3 screen 6). With `next`, also returns the next trade still to journal. */
export async function saveJournalAction(input: JournalFormInput): Promise<ActionResult<{ next: string | null }>> {
  const parsed = journalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { tradeId, next, ...entry } = parsed.data;
  try {
    await writeTradeJournal(tradeId, entry);
    revalidateTracker(tradeId);
    return { ok: true, data: { next: next ? await getNextUnjournaled(tradeId) : null } };
  } catch (error) {
    if (error instanceof JournalError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Saving the journal failed; it was reported.' };
  }
}

const startUpload = z.object({
  tradeId: z.uuid(),
  type: z.string(),
  size: z.number().int().positive(),
});

/** Screenshot upload, step 1: validates the image and returns a signed upload token (5 MB, PNG/JPEG/WebP). */
export async function startScreenshotUploadAction(
  input: z.input<typeof startUpload>,
): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = startUpload.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const ext = SCREENSHOT_TYPES[parsed.data.type];
  if (!ext) return { ok: false, error: 'Only PNG, JPEG or WebP images.' };
  if (parsed.data.size > SCREENSHOT_MAX_BYTES) return { ok: false, error: 'Images must be 5 MB or less.' };
  try {
    return { ok: true, data: await startScreenshotUpload(parsed.data.tradeId, ext) };
  } catch (error) {
    if (error instanceof JournalError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Uploading failed; it was reported.' };
  }
}

const finishUpload = z.object({
  tradeId: z.uuid(),
  path: z.string().min(1).max(200),
  caption: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

/** Screenshot upload, step 2: records the uploaded file on the trade. */
export async function finishScreenshotUploadAction(input: z.input<typeof finishUpload>): Promise<ActionResult<string>> {
  const parsed = finishUpload.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  try {
    await finishScreenshotUpload(parsed.data.tradeId, parsed.data.path, parsed.data.caption);
    revalidateTracker(parsed.data.tradeId);
    return { ok: true, data: 'Screenshot added.' };
  } catch (error) {
    if (error instanceof JournalError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Saving the screenshot failed; it was reported.' };
  }
}

const remove = z.object({ tradeId: z.uuid(), screenshotId: z.uuid() });

export async function deleteScreenshotAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const parsed = remove.safeParse({ tradeId: form.get('tradeId'), screenshotId: form.get('screenshotId') });
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  try {
    await detachScreenshot(parsed.data.screenshotId);
    revalidateTracker(parsed.data.tradeId);
    return { ok: true, data: 'Screenshot removed.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'Removing failed; it was reported.' };
  }
}
