import { expect, test } from '@playwright/test';
import { importFixture, requireAuth, signIn } from './support/auth';

requireAuth();

// The fixture's news covers the week of Mon 5 Oct 2026.
const WEEK = '/news?week=2026-10-05';

test.describe('news (M12)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await importFixture(page);
  });

  test("the week's USD red folders fit one phone screen; filters change the list", async ({ page }) => {
    await page.goto(WEEK);
    const events = page.getByTestId('news-event');
    await expect(events).toHaveCount(1);
    await expect(events.first()).toContainText('FOMC Meeting Minutes');
    await expect(events.first()).toContainText('21:00'); // 18:00 UTC = 21:00 Beirut
    await expect(events.first().getByRole('img', { name: 'Restricted' })).toBeVisible();
    await expect(page.getByTestId('news-last-sync')).toContainText('Calendar last synced: 10 Oct 2026, 00:00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );

    await page
      .getByRole('group', { name: 'Impact' })
      .getByRole('link', { name: /Medium/ })
      .click();
    await expect(page).toHaveURL(/impact=high(%2C|,)medium/);
    await expect(events).toHaveCount(7);
    await expect(page.getByTestId('news-week')).toContainText('ISM Services PMI');

    await page.getByRole('group', { name: 'Currency' }).getByRole('link', { name: 'CAD' }).click();
    await expect(page.getByTestId('news-week')).toContainText('Employment Change');
    // Same-time CAD releases share one time cell.
    const friday = page.getByRole('region', { name: /Friday 9 October/ });
    await expect(friday.getByText('15:30')).toHaveCount(1);

    // Filters are remembered on this device: a bare /news gets them back.
    await page.goto('/news?week=2026-10-05');
    await expect(page).toHaveURL(/currency=USD(%2C|,)CAD/);
    await expect(events).toHaveCount(9);
  });

  test('an event opens a panel with its occurrences and nearby trades', async ({ page }) => {
    await page.goto(`${WEEK}&impact=high&currency=USD`);
    await page.getByTestId('news-event').first().click();
    const panel = page.getByTestId('event-panel');
    await expect(panel).toContainText('FOMC Meeting Minutes');
    await expect(panel).toContainText('Restrictions');
    await expect(panel.getByTestId('event-history').getByRole('listitem').first()).toBeVisible();
    await panel.getByRole('link', { name: 'Close event details' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('event history is searchable', async ({ page }) => {
    await page.goto('/news/history?impact=high,medium&currency=USD');
    await page.getByRole('searchbox', { name: 'Search events' }).fill('fomc');
    await page.getByRole('button', { name: 'Search' }).click();
    const titles = page.getByTestId('event-titles');
    await expect(titles.getByRole('link')).toHaveCount(2);
    await titles.getByRole('link', { name: /FOMC Meeting Minutes/ }).click();
    await expect(page.getByTestId('occurrences')).toContainText('7 Oct 2026 21:00');
  });

  test('the hub shows the News card, and the rules page changes the counted currencies', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('news-hub-summary')).toBeVisible();

    await page.goto('/news/rules');
    const form = page.getByRole('form', { name: 'Restriction window' });
    await form.getByLabel('Currencies that count').fill('USD, CAD');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('status')).toContainText('Saved.');
    await page.evaluate(() => window.localStorage.removeItem('news.filters'));
    await page.goto(WEEK);
    await expect(page.getByTestId('news-event')).toHaveCount(3);

    await page.goto('/news/rules');
    await form.getByLabel('Currencies that count').fill('USD');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('status')).toContainText('Saved.');
  });
});
