import { expect, test } from '@playwright/test';

const PROTECTED = ['/', '/tracker', '/tracker/calendar', '/news', '/backtest', '/settings'];

test.describe('signed out', () => {
  for (const path of PROTECTED) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    });
  }

  test('a failed callback shows the refusal message', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/login\?error=not-allowed/);
    await expect(page.getByRole('alert').filter({ hasText: "This email can't sign in." })).toBeVisible();
  });

  test('the import cron refuses a request without the secret', async ({ request }) => {
    const response = await request.get('/api/cron/import');
    expect(response.status()).toBe(401);
    const wrong = await request.get('/api/cron/import', { headers: { authorization: 'Bearer nope' } });
    expect(wrong.status()).toBe(401);
  });

  test('the candle cron refuses a request without the secret', async ({ request }) => {
    expect((await request.get('/api/cron/candles')).status()).toBe(401);
    const wrong = await request.get('/api/cron/candles', { headers: { authorization: 'Bearer nope' } });
    expect(wrong.status()).toBe(401);
  });
});
