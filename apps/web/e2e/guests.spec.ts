import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createDb } from '@trading/db';
import { requireAuth, signIn } from './support/auth';
import { clearBacktestSessions, clearDrawings, seedCandles } from './support/candles';

requireAuth();

const GUEST = 'guest@example.com';

async function clearGuests() {
  const db = createDb(process.env.DATABASE_URL ?? '');
  try {
    await db.$client`delete from backtest_users`;
    await db.$client`delete from sign_in_failures`;
  } finally {
    await db.$client.end();
  }
}

/** Signs in on the login page with the email alone (no link). */
async function emailOnlySignIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function createRun(page: Page, name: string) {
  await page.goto('/backtest');
  const form = page.getByRole('form', { name: 'New run' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Create and open chart' }).click();
  await expect(page).toHaveURL(/\/backtest\/chart\?session=/);
}

test.describe('Backtest Lab for invited users', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCandles(['2026-10-07']);
  });

  test.beforeEach(async () => {
    await clearDrawings();
    await clearBacktestSessions();
    await clearGuests();
  });

  async function ownerAddsGuest(owner: BrowserContext, baseURL: string) {
    await signIn(owner, baseURL);
    const page = await owner.newPage();
    await page.goto('/settings/users');
    await expect(page.getByText('Nobody else yet.')).toBeVisible();
    const add = page.getByRole('form', { name: 'Add a user' });
    await add.getByLabel('Email to add').fill('Guest@Example.com');
    await add.getByRole('button', { name: 'Add' }).click();
    await expect(add.getByRole('status')).toHaveText(`${GUEST} can now sign in to the Backtest Lab.`);
    await expect(page.getByRole('list', { name: 'Backtest Lab users' })).toContainText(GUEST);
    await createRun(page, 'Joe private run');
    return page;
  }

  test('an email not on the list is refused', async ({ page }) => {
    await emailOnlySignIn(page, 'stranger@example.com');
    await expect(page.getByRole('alert').filter({ hasText: 'doesn’t have access' })).toHaveText(
      'This email doesn’t have access. Ask the owner to add you.',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test("an invited user signs in with the email alone, gets only the lab and never sees Joe's data", async ({
    browser,
    baseURL,
    isMobile,
  }) => {
    test.setTimeout(90_000);
    const owner = await browser.newContext();
    await ownerAddsGuest(owner, baseURL ?? '');

    const guest = await browser.newContext(isMobile ? { viewport: { width: 412, height: 839 }, isMobile } : {});
    const page = await guest.newPage();
    await emailOnlySignIn(page, GUEST);
    await expect(page).toHaveURL(/\/backtest$/);
    await expect(page.getByText('No runs yet')).toBeVisible();
    await expect(page.getByText('Joe private run')).toHaveCount(0);
    // No other modules, no sync status, no setup tags.
    await expect(page.getByRole('link', { name: 'Tracker' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(page.getByRole('form', { name: 'New run' }).getByLabel('Setup')).toHaveCount(0);

    for (const path of ['/', '/tracker', '/tracker/journal', '/news', '/settings', '/settings/users']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/backtest$/);
    }
    expect((await page.request.get('/api/tracker/trades.csv')).status()).toBe(403);
    expect(
      (await page.request.get('/api/backtest/events?from=2026-10-06&to=2026-10-08&until=2026-10-08')).status(),
    ).not.toBe(403);

    await createRun(page, 'Guest run');
    await page.goto('/backtest');
    await expect(page.getByText('Guest run')).toBeVisible();
    await expect(page.getByText('Joe private run')).toHaveCount(0);

    const ownerPage = await owner.newPage();
    await ownerPage.goto('/backtest');
    await expect(ownerPage.getByText('Joe private run')).toBeVisible();
    await expect(ownerPage.getByText('Guest run')).toHaveCount(0);

    // Removing them cuts access on their next request; their run stays for when they're added back.
    await ownerPage.goto('/settings/users');
    await ownerPage
      .getByRole('form', { name: `Remove ${GUEST}` })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(ownerPage.getByText('Nobody else yet.')).toBeVisible();
    await page.goto('/backtest');
    await expect(page).toHaveURL(/\/login/);

    const add = ownerPage.getByRole('form', { name: 'Add a user' });
    await add.getByLabel('Email to add').fill(GUEST);
    await add.getByRole('button', { name: 'Add' }).click();
    await expect(add.getByRole('status')).toContainText('can now sign in');
    // Their session cookie is still valid, so they're straight back in.
    await page.goto('/backtest');
    await expect(page.getByText('Guest run')).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).locator('visible=true').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/backtest');
    await expect(page).toHaveURL(/\/login/);

    await guest.close();
    await owner.close();
  });
});
