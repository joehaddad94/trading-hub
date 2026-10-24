import { expect, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { seedCandles } from './support/candles';
import { openChartSettings } from './support/chart-settings';

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
    await openChartSettings(page);
    await page.getByLabel('Chart time zone').selectOption('America/New_York');
    await page.reload();
    await expect(page.getByLabel('Chart time zone')).toHaveValue('America/New_York');
    // Phones show the data note inside chart settings, desktop under the chart.
    await openChartSettings(page);
    await expect(page.getByText('Historical data from Dukascopy').filter({ visible: true })).toBeVisible();
  });

  test('fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/backtest/chart');
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('phone full screen keeps every control and gives the chart the height', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T14:37:00.000Z');
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-ready', 'true');
    const before = (await chart.boundingBox())?.height ?? 0;
    // The page itself never scrolls: the chart fills what the header and bars leave.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect(page.locator('[data-full-screen="true"]')).toBeVisible();
    await expect.poll(async () => (await chart.boundingBox())?.height ?? 0).toBeGreaterThan(before + 120);
    // Instrument, timeframe, settings, replay, drawing tools and trades all stay on screen.
    for (const name of ['NAS100', '5m', 'Chart settings', 'Exit full screen', 'Play', 'Bar back', 'Exit replay']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
    }
    await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeInViewport();
    await expect(page.getByRole('region', { name: 'Simulated trades' })).toBeInViewport();
    // Remembered after a reload.
    await page.reload();
    await expect(page.locator('[data-full-screen="true"]')).toBeVisible();
    await page.getByRole('button', { name: 'Exit full screen' }).click();
    await expect(page.locator('[data-full-screen="false"]')).toBeVisible();
  });

  test('a phone on its side puts the chart toolbars on one row', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T14:37:00.000Z');
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-ready', 'true');
    const tf = await page.getByRole('button', { name: '5m', exact: true }).boundingBox();
    const play = await page.getByRole('button', { name: 'Play', exact: true }).boundingBox();
    expect(Math.abs((tf?.y ?? 0) - (play?.y ?? 999))).toBeLessThan(4);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect.poll(async () => (await chart.boundingBox())?.height ?? 0).toBeGreaterThan(250);
  });
});
