import { expect, test } from '@playwright/test';
import { importFixture, requireAuth, signIn } from './support/auth';

requireAuth();

test.describe('news in the tracker (M13)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await importFixture(page);
  });

  test('calendar marks the red-folder day and the day view lists its news', async ({ page }) => {
    await page.goto('/tracker/calendar?month=2026-10&day=2026-10-07');
    await expect(page.getByTestId('day-news')).toContainText('FOMC Meeting Minutes');
    await expect(page.getByTestId('day-news')).toContainText('🔒');
  });

  test('trade detail shows news around the trade', async ({ page }) => {
    await page.goto('/tracker/trades?scope=account:7002880');
    await page.locator('a[href^="/tracker/trades/"]:visible').first().click();
    const news = page.getByTestId('trade-news');
    await expect(news).toContainText('Prelim UoM Consumer Sentiment');
    await expect(news).toContainText('opened 13 min before');
    await expect(page.getByTestId('restriction-badge')).toHaveCount(0);
  });

  test('analytics splits news days from other days', async ({ page }) => {
    await page.goto('/tracker/analytics?scope=account:7002880');
    const split = page.getByTestId('news-split');
    await expect(split.getByRole('row', { name: /Red-folder days/ })).toContainText('5');
    await expect(split.getByRole('row', { name: /Other days/ })).toContainText('29');
    await expect(split).toContainText('USD FOMC Meeting Minutes');
  });

  test('restriction badges default off for the funded account with the add-on, and can be forced on', async ({
    page,
  }) => {
    await page.goto('/news/rules');
    await expect(page.getByTestId('restriction-7002880')).toHaveText('Badges off');
    const form = page.getByRole('form', { name: 'Restriction badges for 7002880' });
    await form.getByLabel('Restriction setting for 7002880').selectOption('on');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('status')).toContainText('Saved.');
    await page.reload();
    await expect(page.getByTestId('restriction-7002880')).toHaveText('Badges on');
    await form.getByLabel('Restriction setting for 7002880').selectOption('default');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('status')).toContainText('Saved.');
  });
});
