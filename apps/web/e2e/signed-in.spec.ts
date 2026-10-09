import { fileURLToPath } from 'node:url';
import { type BrowserContext, expect, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const email = process.env.ALLOWED_EMAIL ?? '';
const password = 'e2e-password-not-secret';

const fakeAuth = process.env.E2E_FAKE_AUTH === '1' && !process.env.GITHUB_ACTIONS;

// Needs a local Supabase (`supabase start`; CI starts one), or E2E_FAKE_AUTH=1 locally (e2e/support/fake-auth.mjs).
test.skip(!serviceKey && !fakeAuth, 'SUPABASE_SERVICE_ROLE_KEY not set — local Supabase not running');

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
async function signIn(context: BrowserContext, baseURL: string) {
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
      await expect(page.getByRole('link', { name: 'Back to hub' })).toBeVisible();
    });
  }

  test('tracker navigation matches the viewport', async ({ page, isMobile }) => {
    await page.goto('/tracker');
    // Nothing may be wider than the screen (phone layouts zoom out and misplace fixed bars otherwise).
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    const nav = page.getByRole('navigation', { name: 'Module' });
    await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible();
    if (isMobile) {
      await nav.getByText('More').click();
      await expect(nav.getByRole('link', { name: 'Money' })).toBeVisible();
    } else await expect(page.getByRole('navigation', { name: 'Other modules' })).toBeVisible();
  });

  test('uploading the fixture imports it, and a re-upload changes nothing', async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
    const fixture = fileURLToPath(
      new URL('../../../packages/contract/fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url),
    );
    await page.goto('/settings/imports');
    await page.getByLabel('Export file (JSON, contract v1)').setInputFiles(fixture);
    await page.getByRole('button', { name: 'Upload and import' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Imported|already imported/ })).toBeVisible();
    await expect(page.getByText('fundednext_2026-10-09_2100Z.json').first()).toBeVisible();

    await page.getByLabel('Export file (JSON, contract v1)').setInputFiles(fixture);
    await page.getByRole('button', { name: 'Upload and import' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'already imported' })).toBeVisible();
  });

  test('switching scope changes the URL, the numbers and every Tracker page', async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
    await page.goto('/tracker');
    await expect(page.getByTestId('scope-stats')).toBeVisible();

    await page.getByTestId('scope-selector').selectOption('account:7002880');
    await expect(page).toHaveURL(/scope=account(:|%3A)7002880/);
    // FundedNext's own stats for this account's cycle (tracker spec, M6 acceptance).
    await expect(page.getByTestId('scope-stats')).toContainText('35.29%');
    await expect(page.getByTestId('scope-stats')).toContainText('0.50');

    await page.getByRole('navigation', { name: 'Module' }).getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/tracker\/calendar\?scope=account(:|%3A)7002880/);
    await expect(page.getByTestId('scope-selector')).toHaveValue('account:7002880');

    // No scope in the URL: the last-used scope comes back from this device.
    await page.goto('/tracker');
    await expect(page).toHaveURL(/scope=account(:|%3A)7002880/);

    await page.getByTestId('scope-selector').selectOption('all');
    await expect(page).not.toHaveURL(/scope=/);
    await expect(page.getByTestId('scope-notice')).toBeVisible();
  });

  test('hub shows the Tracker summary', async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
    await page.goto('/');
    await expect(page.getByTestId('tracker-hub-summary')).toContainText('Active account');
    await expect(page.getByTestId('tracker-hub-summary')).toContainText('7002880 · Funded');
  });
});
