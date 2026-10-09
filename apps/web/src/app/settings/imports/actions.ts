'use server';

import * as Sentry from '@sentry/nextjs';
import { importUploadedFile } from '@trading/importer/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/server/db';
import { importFromInbox } from '@/lib/server/imports';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_BYTES = 5 * 1024 * 1024;

const upload = z.object({
  file: z
    .instanceof(File, { message: 'Choose a JSON export file.' })
    .refine((f) => f.size > 0, 'The file is empty.')
    .refine((f) => f.size <= MAX_BYTES, 'The file is larger than 5 MB.'),
});

export async function uploadExport(_prev: ActionResult<string> | null, form: FormData): Promise<ActionResult<string>> {
  const parsed = upload.safeParse({ file: form.get('file') });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid file.' };
  const db = getDb();
  if (!db) return { ok: false, error: 'The database is not configured.' };
  try {
    const outcome = await importUploadedFile(db, parsed.data.file.name, await parsed.data.file.text(), new Date());
    revalidatePath('/settings/imports');
    if (outcome.result === 'failed' || outcome.result === 'rejected') {
      return { ok: false, error: outcome.error ?? `Import ${outcome.result}.` };
    }
    return { ok: true, data: describe(outcome.result, outcome.error) };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: 'The import crashed; it was reported.' };
  }
}

export async function syncNow(_prev: ActionResult<string> | null): Promise<ActionResult<string>> {
  const run = await importFromInbox();
  revalidatePath('/settings/imports');
  if (!run.ok) return { ok: false, error: run.error };
  const imported = run.outcomes.filter((o) => o.result === 'ok' || o.result === 'partial').length;
  const problems = run.outcomes.filter((o) => o.result === 'failed' || o.result === 'rejected').length;
  if (run.outcomes.length === 0) return { ok: true, data: 'No new files in the inbox.' };
  return { ok: true, data: `${imported} file(s) imported${problems ? `, ${problems} with problems` : ''}.` };
}

function describe(result: string, error: string | undefined) {
  if (result === 'already_imported') return 'This file was already imported; nothing changed.';
  if (result === 'partial') return `Imported with warnings:\n${error ?? ''}`;
  return 'Imported.';
}
