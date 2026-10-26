import { expect, test } from '@playwright/test';
import { FIXTURE_PATH, importFixture, requireAuth, signIn } from './support/auth';

requireAuth();

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
    '/settings/users',
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
    // Module pages are tabs under the header on every viewport; Money is the last one.
    const nav = page.getByRole('navigation', { name: 'Module' });
    await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Money' })).toBeAttached();
    // App-level navigation: icon rail on desktop, bottom tab bar on phone.
    const modules = page.getByRole('navigation', { name: 'Modules' });
    await expect(modules.getByRole('link', { name: 'News' })).toBeVisible();
    if (isMobile) {
      await modules.getByText('More').click();
      await expect(modules.getByRole('link', { name: 'Backtest' })).toBeVisible();
    }
  });

  test('uploading the fixture imports it, and a re-upload changes nothing', async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
    const fixture = FIXTURE_PATH;
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

  test('rail hover labels sit above the page on every module', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the rail is desktop-only');
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
    await importFixture(page);
    for (const path of ['/', '/tracker?scope=account:7002880', '/news', '/backtest', '/settings']) {
      await page.goto(path);
      const rail = page.locator('aside').filter({ has: page.getByRole('navigation', { name: 'Modules' }) });
      for (const name of ['Hub', 'Tracker', 'Journal', 'News', 'Backtest']) {
        // Journal's accessible name also carries its badge count.
        await rail.getByRole('link', { name: new RegExp(`^${name}( |$)`) }).hover();
        const label = rail.locator('span[aria-hidden]', { hasText: new RegExp(`^${name}$`) });
        await expect(label).toHaveCSS('opacity', '1');
        const box = await label.boundingBox();
        expect(box, `${name} label on ${path}`).not.toBeNull();
        if (!box) continue;
        // Probe the label's right end, which overlaps the page content: the label must be on top there.
        // The label ignores the pointer, so let hit-testing see it for the probe.
        const onTop = await label.evaluate(
          (el, [x, y]) => {
            (el as HTMLElement).style.pointerEvents = 'auto';
            const hit = document.elementFromPoint(x, y);
            (el as HTMLElement).style.pointerEvents = '';
            return hit === el;
          },
          [box.x + box.width - 3, box.y + box.height / 2] as const,
        );
        expect(onTop, `${name} label hidden on ${path}`).toBe(true);
      }
    }
  });

  test('hub shows the Tracker summary', async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
    await page.goto('/');
    await expect(page.getByTestId('tracker-hub-summary')).toContainText('Active account');
    await expect(page.getByTestId('tracker-hub-summary')).toContainText('7002880 · Funded');
    // The fixture's trades are all in the past, so today has none and the hero leads with this week instead.
    await expect(page.getByTestId('hub-hero')).toContainText('This week');
    await expect(page.getByTestId('hub-week')).toBeVisible();
    await expect(page.getByTestId('hub-hero')).toContainText('No trades yet');
    // U7: max-loss room for the active account, and "To journal" goes straight to the quick-journal queue.
    await expect(page.getByTestId('hub-max-loss')).toContainText('Room to max loss');
    await page.getByTestId('hub-quick-journal').click();
    await expect(page).toHaveURL(/\/tracker\/journal\?.*view=quick/);
    await expect(page.getByTestId('quick-journal')).toBeVisible();
  });
});
