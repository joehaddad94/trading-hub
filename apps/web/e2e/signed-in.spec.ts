import { type BrowserContext, expect, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const email = process.env.ALLOWED_EMAIL ?? '';
const password = 'e2e-password-not-secret';

// Needs a local Supabase (`supabase start`); CI starts one.
test.skip(!serviceKey, 'SUPABASE_SERVICE_ROLE_KEY not set — local Supabase not running');

/** Signs in with a password through @supabase/ssr and copies the resulting session cookies into the browser. */
async function signIn(context: BrowserContext, baseURL: string) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError && !/already/i.test(createError.message)) throw createError;

  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) jar.push({ name: c.name, value: c.value });
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await context.addCookies(jar.map((c) => ({ ...c, url: baseURL })));
}

test.describe('signed in', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL ?? '');
  });

  test('hub shows the three modules', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Trading Hub' })).toBeVisible();
    for (const name of ['Open Tracker', 'Open News', 'Open Backtest Lab']) {
      await expect(page.getByRole('link', { name })).toBeVisible();
    }
  });

  test('login redirects to the hub', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  for (const path of [
    '/tracker',
    '/tracker/calendar',
    '/tracker/trades',
    '/tracker/journal',
    '/tracker/accounts',
    '/tracker/analytics',
    '/tracker/money',
    '/news',
    '/news/history',
    '/news/rules',
    '/backtest',
    '/settings',
    '/settings/imports',
  ]) {
    test(`${path} renders inside its module`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('link', { name: 'Back to hub' }).or(page.getByText('Not built yet'))).toBeVisible();
    });
  }

  test('tracker navigation matches the viewport', async ({ page, isMobile }) => {
    await page.goto('/tracker');
    const nav = page.getByRole('navigation', { name: 'Module' });
    await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible();
    if (isMobile) {
      await nav.getByText('More').click();
      await expect(nav.getByRole('link', { name: 'Money' })).toBeVisible();
    } else await expect(page.getByRole('navigation', { name: 'Other modules' })).toBeVisible();
  });
});
