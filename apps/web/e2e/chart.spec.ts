import { expect, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { seedCandles } from './support/candles';

requireAuth();

type Bar = { ts: number; open: number; high: number; low: number; close: number };

test.describe('backtest chart (M15)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeAll(async () => {
    await seedCandles(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL ?? '');
  });

  test('the candles API requires until and never returns a bar after it', async ({ page }) => {
    expect((await page.request.get('/api/backtest/candles?instrument=US30&tf=5')).status()).toBe(400);
    const until = '2026-10-07T14:37:00.000Z';
    const res = await page.request.get(`/api/backtest/candles?instrument=US30&tf=15&until=${until}&count=40`);
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as { data: { bars: Bar[] } };
    expect(data.bars).toHaveLength(40);
    expect(new Date(data.bars.at(-1)?.ts ?? 0).toISOString()).toBe('2026-10-07T14:30:00.000Z');
    const minutes = await page.request.get(`/api/backtest/candles?instrument=US30&tf=1&until=${until}&count=8`);
    const m = ((await minutes.json()) as { data: { bars: Bar[] } }).data.bars;
    expect(m.every((b) => b.ts <= Date.parse(until))).toBe(true);
    expect(data.bars.at(-1)?.close).toBe(m.at(-1)?.close);
  });

  test('instrument and timeframe switch, with keyboard shortcuts', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5');
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('[data-testid="kline-chart"] canvas').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '5m', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('f');
    await expect(page).toHaveURL(/tf=15/);
    await expect(page.getByRole('button', { name: '15m', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('1');
    await expect(page).toHaveURL(/tf=1(&|$)/);
    await expect(page.getByRole('button', { name: 'US30' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'NAS100' }).click();
    await expect(page).toHaveURL(/i=NAS100/);
    await expect(page.getByRole('button', { name: 'NAS100' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Chart time zone').selectOption('America/New_York');
    await page.reload();
    await expect(page.getByLabel('Chart time zone')).toHaveValue('America/New_York');
    await expect(page.getByText('Historical data from Dukascopy')).toBeVisible();
  });

  test('fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/backtest/chart');
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
