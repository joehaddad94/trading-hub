import { fileURLToPath } from 'node:url';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const email = process.env.ALLOWED_EMAIL ?? '';
const password = 'e2e-password-not-secret';

const fakeAuth = process.env.E2E_FAKE_AUTH === '1' && !process.env.GITHUB_ACTIONS;

/** Call at the top of a spec that needs a signed-in browser. */
export function requireAuth() {
  // Needs a local Supabase (`supabase start`; CI starts one), or E2E_FAKE_AUTH=1 locally (e2e/support/fake-auth.mjs).
  test.skip(!serviceKey && !fakeAuth, 'SUPABASE_SERVICE_ROLE_KEY not set — local Supabase not running');
}

/** An unsigned-but-well-formed HS256 token; only the local fake auth server accepts it. */
function fakeAccessToken() {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const claims = {
    sub: '00000000-0000-4000-8000-000000000001',
    email,
    role: 'authenticated',
    aud: 'authenticated',
    exp,
  };
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.fake-signature`;
}

/** Signs in through @supabase/ssr (password, or a fake session locally) and copies the resulting session cookies into the browser. */
export async function signIn(context: BrowserContext, baseURL: string) {
  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) jar.push({ name: c.name, value: c.value });
      },
    },
  });
  if (fakeAuth) {
    const { error } = await supabase.auth.setSession({ access_token: fakeAccessToken(), refresh_token: 'fake' });
    if (error) throw error;
  } else {
    await passwordSignIn(supabase);
  }
  await context.addCookies(jar.map((c) => ({ ...c, url: baseURL })));
}

async function passwordSignIn(supabase: ReturnType<typeof createServerClient>) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError && !/already/i.test(createError.message)) throw createError;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export const FIXTURE_PATH = fileURLToPath(
  new URL('../../../../packages/contract/fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url),
);

/** Uploads the real fixture through Settings › Imports (a no-op when it is already imported). */
export async function importFixture(page: Page) {
  await page.goto('/settings/imports');
  await page.getByLabel('Export file (JSON, contract v1)').setInputFiles(FIXTURE_PATH);
  await page.getByRole('button', { name: 'Upload and import' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Imported|already imported/ })).toBeVisible();
}
