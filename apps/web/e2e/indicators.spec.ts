import { expect, type Page, test } from '@playwright/test';
import { atr, type Ohlc, rsi } from '@trading/indicators';
import { requireAuth, signIn } from './support/auth';
import { seedCandles } from './support/candles';

requireAuth();

const AT = '2026-10-07T16:00:00.000Z';
const chart = (page: Page) => page.getByTestId('kline-chart');

async function shown(page: Page, id: string): Promise<number | null> {
  const raw = await chart(page).getAttribute(`data-indicator-${id}`);
  return raw ? Number(raw) : null;
}

/** The same window the chart loads (500 bars up to the cursor), straight from the API. */
async function bars(page: Page, until: string, count = 500): Promise<Ohlc[]> {
  const res = await page.request.get(`/api/backtest/candles?instrument=US30&tf=5&until=${until}&count=${count}`);
  return ((await res.json()) as { data: { bars: Ohlc[] } }).data.bars;
}

test.describe('indicators (M19)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeAll(async () => {
    await seedCandles(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL ?? '');
  });

  test('ATR and RSI match the TradingView formulas, follow the cursor, and keep their settings', async ({ page }) => {
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await expect(chart(page)).toHaveAttribute('data-ready', 'true');
    await page.evaluate(() => window.localStorage.removeItem('backtest.chart'));
    await page.reload();
    await expect.poll(async () => (await chart(page).getAttribute('data-last-bar')) ?? '').not.toBe('');

    await page.getByRole('button', { name: 'ATR', exact: true }).click();
    await page.getByRole('button', { name: 'RSI', exact: true }).click();
    const window1 = await bars(page, AT);
    await expect.poll(() => shown(page, 'atr')).toBeCloseTo(atr(window1).at(-1) as number, 6);
    await expect.poll(() => shown(page, 'rsi')).toBeCloseTo(rsi(window1.map((b) => b.close)).at(-1) as number, 6);

    // One bar forward: the newest value moves with the cursor (and only uses bars up to it).
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('replay-cursor')).not.toHaveAttribute('data-cursor', String(Date.parse(AT)));
    const cursor = Number(await page.getByTestId('replay-cursor').getAttribute('data-cursor'));
    const window2 = await bars(page, new Date(cursor).toISOString(), 501);
    await expect.poll(() => shown(page, 'atr')).toBeCloseTo(atr(window2).at(-1) as number, 6);

    // RSI length 7 from the settings panel.
    await page.getByRole('button', { name: 'RSI settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'RSI settings' });
    await dialog.getByLabel('Length').fill('7');
    await dialog.getByLabel('Length').press('Enter');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect
      .poll(() => shown(page, 'rsi'))
      .toBeCloseTo(
        rsi(
          window2.map((b) => b.close),
          { length: 7 },
        ).at(-1) as number,
        6,
      );

    // Settings and toggles persist; turning ATR off removes it.
    await page.reload();
    await expect(page.getByRole('button', { name: 'RSI', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => shown(page, 'rsi')).not.toBeNull();
    await page.getByRole('button', { name: 'ATR', exact: true }).click();
    await expect(chart(page)).not.toHaveAttribute('data-indicator-atr', /./);
  });
});
