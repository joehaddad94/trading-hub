import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const SCREENSHOT_BUCKET = 'journal-screenshots';
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const SCREENSHOT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const SIGNED_URL_SECONDS = 600;

let client: SupabaseClient | null | undefined;

/** Service-role Storage client (server only, CLAUDE.md rule 10). Null when the key isn't configured. */
function storage() {
  if (client === undefined) {
    client = env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  }
  return client;
}

export const screenshotsEnabled = () => storage() !== null;

/**
 * Signed upload URL: the browser uploads straight to the private bucket, so images never pass through a
 * Vercel function (4.5 MB request limit). The bucket enforces the 5 MB / image-type limits too.
 */
export async function createScreenshotUpload(path: string) {
  const s = storage();
  if (!s) throw new Error('Screenshot storage is not configured.');
  const { data, error } = await s.storage.from(SCREENSHOT_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, token: data.token };
}

export async function screenshotExists(path: string) {
  const s = storage();
  if (!s) return false;
  const { data } = await s.storage.from(SCREENSHOT_BUCKET).exists(path);
  return data === true;
}

export async function deleteScreenshotFile(path: string) {
  const s = storage();
  if (!s) return;
  const { error } = await s.storage.from(SCREENSHOT_BUCKET).remove([path]);
  if (error) throw error;
}

/** Short-lived signed URLs for the private bucket; missing ones map to null. */
export async function signedScreenshotUrls(paths: string[]): Promise<Map<string, string | null>> {
  const s = storage();
  const out = new Map<string, string | null>(paths.map((p) => [p, null]));
  if (!s || paths.length === 0) return out;
  const { data, error } = await s.storage.from(SCREENSHOT_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) return out;
  for (const row of data) if (row.path) out.set(row.path, row.signedUrl ?? null);
  return out;
}
