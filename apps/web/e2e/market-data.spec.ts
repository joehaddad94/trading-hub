import { expect, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';

requireAuth();

test.describe('market data (M14)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test('the lab shows candle coverage and warns while no daily import has run', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await page.goto('/backtest');
    const coverage = page.getByRole('region', { name: 'Market data' });
    await expect(coverage).toContainText('US30 · Dow Jones');
    await expect(coverage).toContainText('NAS100 · Nasdaq 100');
    await expect(coverage).toContainText('Historical data from Dukascopy');
    const banner = page.getByRole('alert').filter({ hasText: 'Market data needs attention' });
    await expect(banner).toContainText('US30:');
  });
});
