import { expect, type Page, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { clearBacktestSessions, clearDrawings, seedCandles } from './support/candles';

requireAuth();

const AT = '2026-10-07T14:00:00.000Z';
const rows = (page: Page) => page.getByTestId('order-row');

/** Draggable order lines as the chart reports them: key "<orderId>:<level>", price and pixel row. */
async function orderLines(page: Page): Promise<{ key: string; price: number; y: number | null }[]> {
  const raw = await page.locator('[data-order-lines]').first().getAttribute('data-order-lines');
  return JSON.parse(raw ?? '[]');
}

async function clickChart(page: Page, fx: number, fy: number) {
  await page.getByTestId('kline-chart').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('kline-chart').boundingBox();
  if (!box) throw new Error('chart not visible');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(550);
}

test.describe('simulated trading (M20)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCandles(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await clearDrawings();
    await clearBacktestSessions();
    await signIn(context, baseURL ?? '');
  });

  test('a long placed from the tool fills on the next bar, closes, shows in the tracker, and deletes with undo', async ({
    page,
  }) => {
    await page.goto('/tracker/trades');
    const liveSummary = (await page.getByTestId('trades-summary').textContent()) ?? '';
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    await expect
      .poll(async () => (await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '')
      .not.toBe('');

    await page.keyboard.press('Alt+KeyL');
    await clickChart(page, 0.7, 0.5);
    await page.getByRole('button', { name: 'Buy market' }).click();
    // The trade list opens by itself on a new order.
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toHaveAttribute('data-status', 'pending');
    // The tool became the order.
    await expect
      .poll(async () => JSON.parse((await page.getByTestId('chart-area').getAttribute('data-drawings')) ?? '[]'))
      .toEqual([]);
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-order-marks', '1');

    // Next bar: filled at its open plus the spread.
    await page.keyboard.press('ArrowRight');
    await expect(rows(page).first()).toHaveAttribute('data-status', 'open');

    // A day later the stop or target has been hit.
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(rows(page).first()).toHaveAttribute('data-status', 'closed');
    await expect(rows(page).first()).toContainText(/R\)/);

    // The trade is a backtest trade in the tracker, not a live one.
    await page.goto('/tracker/trades?scope=backtest');
    await expect(page.getByTestId('trades-summary')).toContainText(/^1 trade/);
    await page.goto('/tracker/trades');
    await expect(page.getByTestId('trades-summary')).toHaveText(liveSummary);

    // Delete, undo, delete for good.
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await page.getByRole('button', { name: /Run \d+/ }).click();
    page.once('dialog', (d) => {
      expect(d.message()).toContain('removed from all stats');
      void d.accept();
    });
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await expect(rows(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(rows(page)).toHaveCount(1);
    page.once('dialog', (d) => void d.accept());
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await expect(rows(page)).toHaveCount(0);
    await page.goto('/tracker/trades?scope=backtest');
    await expect(page.getByTestId('trades-summary')).toContainText(/^0 trades/);
  });

  test('a pending order can be cancelled and an open one closed at market', async ({ page }) => {
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    await expect
      .poll(async () => (await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '')
      .not.toBe('');

    await page.keyboard.press('Alt+KeyS');
    await clickChart(page, 0.7, 0.15);
    await page.getByRole('button', { name: 'Place pending' }).click();
    await expect(rows(page).first()).toHaveAttribute('data-status', 'pending');
    // A pending order shows draggable entry, SL and TP lines.
    await expect.poll(async () => (await orderLines(page)).length).toBe(3);
    await rows(page).first().getByRole('button', { name: 'Cancel' }).click();
    await expect(rows(page)).toHaveCount(0);

    await page.keyboard.press('Alt+KeyL');
    await clickChart(page, 0.7, 0.5);
    await page.getByRole('button', { name: 'Buy market' }).click();
    await page.keyboard.press('ArrowRight');
    await expect(rows(page).first()).toHaveAttribute('data-status', 'open');
    await rows(page).first().getByRole('button', { name: 'BE' }).click();
    await expect(rows(page).first()).toContainText(/SL (\S+) · TP/);
    const fill = (await rows(page).first().textContent())?.match(/@ ([\d.]+)/)?.[1];
    await expect(rows(page).first()).toContainText(`SL ${fill}`);

    // Drag the TP line up: the order's target moves with it.
    const tpBefore = (await rows(page).first().textContent())?.match(/TP ([\d.]+)/)?.[1];
    const tp = (await orderLines(page)).find((l) => l.key.endsWith(':tp'));
    const box = await page.getByTestId('kline-chart').boundingBox();
    if (!tp?.y || !box) throw new Error('no TP line');
    await page.mouse.move(box.x + box.width * 0.3, box.y + tp.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + tp.y - 25, { steps: 5 });
    await page.mouse.up();
    await expect(rows(page).first()).not.toContainText(`TP ${tpBefore}`);
    const tpAfter = Number((await rows(page).first().textContent())?.match(/TP ([\d.]+)/)?.[1]);
    expect(tpAfter).toBeGreaterThan(Number(tpBefore));

    // Close half, then the rest.
    const lots = Number((await rows(page).first().textContent())?.match(/US30 ([\d.]+)/)?.[1]);
    await rows(page).first().getByRole('button', { name: 'Part' }).click();
    await page.getByRole('form', { name: 'Partial close' }).getByRole('button', { name: 'Close part' }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator('[data-testid="order-row"][data-status="open"]')).toContainText(
      `US30 ${(lots - Math.floor((lots * 100) / 2) / 100).toFixed(2)}`,
    );
    await page.locator('[data-testid="order-row"][data-status="open"]').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('[data-testid="order-row"][data-status="closed"]')).toHaveCount(2);
  });
});
