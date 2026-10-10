import { expect, test } from '@playwright/test';
import { importFixture, requireAuth, signIn } from './support/auth';

requireAuth();

test.describe('trading calendar (§8.2)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await importFixture(page);
  });

  test('month grid matches FundedNext for account 7002880, October 2026', async ({ page }) => {
    await page.goto('/tracker/calendar?scope=account:7002880&month=2026-10');
    await expect(page.getByTestId('calendar-month')).toHaveText('October 2026');
    // FundedNext's own calendar shows "$383.70 · 3 Trades" (red) on 1 October.
    await expect(page.getByTestId('day-2026-10-01')).toHaveAttribute('aria-label', '2026-10-01, -$383.70, 3 trades');
    await expect(page.getByTestId('day-2026-10-05')).toHaveAttribute('aria-label', '2026-10-05, $492.21, 2 trades');
    await expect(page.getByTestId('day-2026-10-02')).toHaveAttribute('aria-label', '2026-10-02, no trades');
    // Mon–Fri only: no weekend trades this month.
    await expect(page.getByTestId('day-2026-10-03')).toHaveCount(0);
    await expect(page.getByTestId('month-summary')).toContainText('Trading days');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  });

  test('preview, day view, daily note and close', async ({ page, isMobile }) => {
    await page.goto('/tracker/calendar?scope=account:7002880&month=2026-10');
    const day = page.getByTestId('day-2026-10-01');
    if (!isMobile) {
      await day.hover();
      await expect(page.getByRole('tooltip')).toContainText('7002880 · Funded');
      await expect(page.getByRole('tooltip')).toContainText('0 W · 3 L');
    }
    await day.click();
    await expect(page).toHaveURL(/day=2026-10-01/);
    const view = page.getByTestId('day-view');
    await expect(view).toBeVisible();
    await expect(view.getByTestId('day-trades').getByRole('listitem')).toHaveCount(3);
    await expect(view).toContainText('Daily loss used');
    await expect(view.getByTestId('day-equity')).toBeVisible();
    if (isMobile) {
      const box = await view.boundingBox();
      expect(box?.width).toBe(page.viewportSize()?.width);
    }

    await view.getByLabel('Notes').fill('Three losses before NY open.');
    await view.getByRole('button', { name: 'Save note' }).click();
    await expect(view.getByRole('status')).toHaveText('Note saved.');

    await view.getByRole('link', { name: 'Close day view' }).click();
    await expect(page.getByTestId('day-view')).toHaveCount(0);
    await expect(page).not.toHaveURL(/day=/);
  });

  test('cell toggle, month switcher and scope', async ({ page }) => {
    await page.goto('/tracker/calendar?scope=account:7002880&month=2026-10');
    await page.getByRole('button', { name: 'Trades', exact: true }).click();
    await expect(page).toHaveURL(/cell=count/);
    await expect(page.getByTestId('day-2026-10-01')).toHaveAttribute('aria-label', '2026-10-01, 3 trades');

    await page.getByRole('link', { name: 'Previous month' }).click();
    await expect(page.getByTestId('calendar-month')).toHaveText('September 2026');
    await expect(page).toHaveURL(/cell=count/);

    // The P1 → P2 journey shows its September trades and the pass on the 16th.
    await page.getByTestId('scope-selector').selectOption('journey:3027687');
    await expect(page).toHaveURL(/scope=journey(:|%3A)3027687/);
    await expect(page.getByTestId('day-2026-09-16')).toHaveAttribute('aria-label', /2 trades/);
    await expect(page.getByTestId('month-summary')).toContainText('3027687');
  });
});
