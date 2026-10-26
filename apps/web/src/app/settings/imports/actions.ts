'use server';

import * as Sentry from '@sentry/nextjs';
import { importUploadedFile, sendTestAlert } from '@trading/importer/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/lib/server/db';
import { importFromInbox, reprocessStoredImport, runHealthCheck } from '@/lib/server/imports';

export type { ActionResult } from '@/lib/action-result';

import type { ActionResult } from '@/lib/action-result';
import { ownerOnly } from '@/lib/server/viewer';

const MAX_BYTES = 5 * 1024 * 1024;

const upload = z.object({
  file: z
    .instanceof(File, { message: 'Choose a JSON export file.' })
    .refine((f) => f.size > 0, 'The file is empty.')
    .refine((f) => f.size <= MAX_BYTES, 'The file is larger than 5 MB.'),
});

export async function uploadExport(_prev: ActionResult<string> | null, form: FormData): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
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
  const denied = await ownerOnly();
  if (denied) return denied;
  const run = await importFromInbox();
  revalidatePath('/settings/imports');
  if (!run.ok) return { ok: false, error: run.error };
  if (run.busy) return { ok: true, data: 'An import is already running. Check back in a minute.' };
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

export async function runHealthCheckAction(_prev: ActionResult<string> | null): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const result = await runHealthCheck();
  revalidatePath('/settings/imports');
  if (!result) return { ok: false, error: 'The health check could not run.' };
  if (result.conditions.length === 0) return { ok: true, data: 'Healthy: no sync problems found.' };
  return {
    ok: true,
    data: `${result.conditions.length} problem(s):\n${result.conditions.map((c) => c.message).join('\n')}`,
  };
}

export async function sendTestAlertAction(_prev: ActionResult<string> | null): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const db = getDb();
  if (!db) return { ok: false, error: 'The database is not configured.' };
  await sendTestAlert(db, new Date());
  revalidatePath('/settings/imports');
  return { ok: true, data: 'Test alert sent to the in-app channel.' };
}

/** Re-runs one stored file (rejected, failed or partial) through the current importer. */
export async function reprocessAction(
  _prev: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = z.uuid().safeParse(form.get('id'));
  if (!parsed.success) return { ok: false, error: 'Unknown import.' };
  const run = await reprocessStoredImport(parsed.data);
  revalidatePath('/settings/imports');
  revalidatePath('/', 'layout');
  if (!run.ok) return { ok: false, error: run.error };
  if (run.busy) return { ok: true, data: 'An import is already running. Try again in a minute.' };
  const [outcome] = run.outcomes;
  if (!outcome) return { ok: false, error: 'Nothing was reprocessed.' };
  if (outcome.result === 'failed' || outcome.result === 'rejected') {
    return { ok: false, error: outcome.error ?? `Still ${outcome.result}.` };
  }
  return { ok: true, data: describe(outcome.result, outcome.error) };
}
