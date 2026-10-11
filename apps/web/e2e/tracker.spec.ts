import { expect, test } from '@playwright/test';
import { importFixture, requireAuth, signIn } from './support/auth';

requireAuth();

test.describe('tracker screens (M8)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await importFixture(page);
  });

  const noSideScroll = async (page: import('@playwright/test').Page) =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );

  test('overview shows headline stats, combined equity and the calendar', async ({ page }) => {
    await page.goto('/tracker?scope=account:7002880');
    await expect(page.getByTestId('scope-stats')).toContainText('35.29%');
    await expect(page.getByTestId('equity-curve')).toBeVisible();
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    await noSideScroll(page);
  });

  test('accounts are grouped by journey, with detail tabs', async ({ page }) => {
    await page.goto('/tracker/accounts');
    await expect(page.getByTestId('journey')).toHaveCount(2);
    await expect(page.getByTestId('account-7002880')).toContainText('$23,655.29');
    await expect(page.getByTestId('account-3027687')).toContainText('passed', { ignoreCase: true });
    await noSideScroll(page);

    await page.getByTestId('account-7002880').click();
    await expect(page).toHaveURL(/\/tracker\/accounts\/7002880$/);
    await expect(page.getByTestId('account-header')).toContainText('Funded · 25K · FundedNext');
    await expect(page.getByTestId('rule-limits')).toContainText('5% · $1,250.00');
    await expect(page.getByTestId('lifecycle')).toContainText('Funded started');
    await expect(page.getByTestId('balance-curve')).toBeVisible();
    await noSideScroll(page);

    await page.getByRole('link', { name: 'trades', exact: true }).click();
    await expect(page.getByTestId('trade-row').filter({ visible: true })).toHaveCount(34);
    await page.getByRole('link', { name: 'calendar', exact: true }).click();
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
  });

  test('demo vs funded compares the same metrics and highlights the biggest gaps', async ({ page }) => {
    await page.goto('/tracker/accounts/compare');
    const table = page.getByTestId('compare-table');
    await expect(table).toContainText('All funded');
    await expect(table.locator('tr[data-highlight]')).toHaveCount(3);
    await noSideScroll(page);
  });

  test('trades filter, sort and export the filtered view as CSV', async ({ page }) => {
    await page.goto('/tracker/trades');
    await expect(page.getByTestId('trades-summary')).toContainText('99 trades');
    await page.getByLabel('Symbol').selectOption('US30');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/symbol=US30/);
    const summary = await page.getByTestId('trades-summary').textContent();
    const count = Number(summary?.match(/^(\d+) trades/)?.[1]);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(99);

    const csv = await page.request.get('/api/tracker/trades.csv?symbol=US30');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    const lines = (await csv.text()).trim().split('\r\n');
    expect(lines).toHaveLength(count + 1);
    expect(lines.slice(1).every((l) => l.includes(',US30,'))).toBe(true);
    await noSideScroll(page);

    // The whole row opens the trade, not just the symbol; an unjournaled trade shows one quiet dot.
    const row = page.getByTestId('trade-row').filter({ visible: true }).first();
    await expect(row.getByTestId('needs-journal')).toBeVisible();
    await expect(row).not.toContainText('not journaled');
    const box = await row.boundingBox();
    if (!box) throw new Error('no row box');
    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    await expect(page).toHaveURL(/\/tracker\/trades\/[0-9a-f-]{36}/);
  });

  test('settings save the day boundary and show learned point values', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByLabel('NDX100 · FundedNext')).toHaveValue('10.0000');
    const form = page.getByRole('form', { name: 'Days and scratches' });
    await form.getByLabel('New York, 17:00 rollover').check();
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('status')).toHaveText('Saved.');
    await page.reload();
    await expect(page.getByLabel('New York, 17:00 rollover')).toBeChecked();
    // Put the default back for the other tests.
    await page.getByLabel('Asia/Beirut, midnight').check();
    await page.getByRole('form', { name: 'Days and scratches' }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('form', { name: 'Days and scratches' }).getByRole('status')).toHaveText('Saved.');
    await noSideScroll(page);
  });

  test('settings link the funded account to its P2, joining one journey', async ({ page }) => {
    await page.goto('/settings');
    const form = page.getByRole('form', { name: '7002880 previous phase' });
    await form.getByLabel('7002880 · Funded came from').selectOption({ label: '3028722 · P2' });
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('status')).toHaveText('Linked.');
    await page.goto('/tracker/accounts');
    await expect(page.getByTestId('journey')).toHaveCount(1);
    // Unlink so the other tests see two journeys.
    await page.goto('/settings');
    await form.getByLabel('7002880 · Funded came from').selectOption('');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('status')).toHaveText('Unlinked.');
    await noSideScroll(page);
  });
});
