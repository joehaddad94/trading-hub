import { expect, type Page, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { seedCandles } from './support/candles';
import { chartReady } from './support/chart';

requireAuth();

const html = (page: Page) => page.locator('html');
const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('light and dark mode', () => {
  test.beforeAll(async () => {
    await seedCandles(['2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL ?? '');
  });

  test('follows the device setting from the first paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    // The class must be on <html> in the served document's first script run, before React loads.
    await page.goto('/settings', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.classList.length > 0);
    await expect(html(page)).toHaveClass(/\blight\b/);
    expect(await bodyBackground(page)).toBe('rgb(241, 244, 248)');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html(page)).toHaveClass(/\bdark\b/);
    expect(await bodyBackground(page)).toBe('rgb(59, 66, 80)');
  });

  test('the one-tap button on the hub flips the theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Light mode' }).click();
    await expect(html(page)).toHaveClass(/\blight\b/);
    await page.goto('/news');
    await expect(html(page)).toHaveClass(/\blight\b/);
  });

  test('every module bar has the theme button and the account menu, the Backtest Lab too', async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/backtest/chart');
    if (isMobile) {
      // The phone Backtest bar is one row: the theme lives in the account menu there.
      await page.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('group', { name: 'Theme' }).getByText('Light', { exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Light mode' }).click();
    }
    await expect(html(page)).toHaveClass(/\blight\b/);
    for (const path of ['/tracker', '/news', '/settings']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Dark mode' })).toBeVisible();
      await page.getByRole('button', { name: 'Account' }).click();
      await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    }
  });

  test('a choice in Settings beats the device setting and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    const theme = page.getByRole('group', { name: 'Theme' });
    await theme.getByText('Light', { exact: true }).click();
    await expect(html(page)).toHaveClass(/\blight\b/);
    await expect(theme.getByRole('radio', { name: 'Light' })).toBeChecked();

    await page.reload();
    await expect(html(page)).toHaveClass(/\blight\b/);
    await expect(page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Light' })).toBeChecked();

    await page.getByRole('group', { name: 'Theme' }).getByText('System', { exact: true }).click();
    await expect(html(page)).toHaveClass(/\bdark\b/);
  });

  test('the backtest chart switches palette with the app', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T14:00:00.000Z');
    await chartReady(page);
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-theme', 'dark');

    // "System" follows the device live, chart included.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(chart).toHaveAttribute('data-theme', 'light');
    const pane = await chart.evaluate((el) => getComputedStyle(el.closest('.chart-pane') as Element).backgroundColor);
    expect(pane).toBe('rgb(255, 255, 255)');
  });
});
