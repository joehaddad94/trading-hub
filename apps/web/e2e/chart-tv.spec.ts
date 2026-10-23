import { expect, type Page, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { clearDrawings, seedCandles } from './support/candles';

requireAuth();

/** Chart behaviour matched to TradingView (audit of 23 Oct 2026). */

const chart = (page: Page) => page.getByTestId('kline-chart');
const cursor = (page: Page) => page.getByTestId('replay-cursor');
const lastX = async (page: Page) => Number(await chart(page).getAttribute('data-last-x'));
const shownCount = async (page: Page) =>
  (JSON.parse((await page.getByTestId('chart-area').getAttribute('data-drawings')) ?? '[]') as unknown[]).length;

async function open(page: Page, query: string) {
  await page.goto(`/backtest/chart?${query}`);
  await expect(chart(page)).toHaveAttribute('data-ready', 'true');
  await expect.poll(async () => (await chart(page).getAttribute('data-last-bar')) ?? '').not.toBe('');
  await expect(chart(page)).toHaveAttribute('data-loading', '');
}

/** Drags the candles from one fraction of the chart's width to another, at 40% of its height. */
async function pan(page: Page, from: number, to: number) {
  const box = await chart(page).boundingBox();
  if (!box) throw new Error('no chart');
  const y = box.y + box.height * 0.4;
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to, y, { steps: 8 });
  await page.mouse.up();
}

test.describe('chart like TradingView', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
  test.skip(({ isMobile }) => isMobile, 'mouse and keyboard behaviour');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCandles(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await clearDrawings();
    await signIn(context, baseURL ?? '');
  });

  test('Shift+→ steps one bar without scrolling, Alt+→ one minute, Shift+↓ plays and pauses', async ({ page }) => {
    await open(page, 'i=US30&tf=5&at=2026-10-07T14:37:00.000Z');
    // Two plain steps leave the newest bar pinned at the right margin.
    await page.keyboard.press('ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:39:00Z')));
    await page.keyboard.press('ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:44:00Z')));
    const x0 = await lastX(page);
    await page.keyboard.press('Shift+ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:49:00Z')));
    // One bar, and the view stays pinned: the library's own Shift+→ (scroll 3 bars) no longer fires too.
    expect(Math.abs((await lastX(page)) - x0)).toBeLessThan(2);
    await page.keyboard.press('Alt+ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:50:00Z')));
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:49:00Z')));
    await expect(page).toHaveURL(/backtest\/chart/);

    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('» brings back the newest bar, Alt+R resets, and a timeframe switch in replay keeps the place', async ({
    page,
  }) => {
    await open(page, 'i=US30&tf=5&at=2026-10-07T16:00:00.000Z');
    const latest = page.getByTestId('chart-latest');
    await expect(latest).toBeHidden();
    await pan(page, 0.2, 0.9);
    await expect(latest).toBeVisible();
    await latest.click();
    await expect(latest).toBeHidden();

    await pan(page, 0.2, 0.9);
    await expect(latest).toBeVisible();
    await page.keyboard.press('Alt+KeyR');
    await expect(latest).toBeHidden();

    // Panned back, 5m → 15m stays back in time instead of jumping to the newest bar.
    await pan(page, 0.2, 0.9);
    await expect(latest).toBeVisible();
    await page.keyboard.press('f');
    await expect(page).toHaveURL(/tf=15/);
    await expect(chart(page)).toHaveAttribute('data-loading', '');
    await expect(latest).toBeVisible();
  });

  test('dragging the price axis turns auto scale off; A turns it back on', async ({ page }) => {
    await open(page, 'i=US30&tf=5&at=2026-10-07T16:00:00.000Z');
    const auto = page.getByTestId('chart-auto-scale');
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    const box = await chart(page).boundingBox();
    if (!box) throw new Error('no chart');
    await page.mouse.move(box.x + box.width - 20, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await expect(auto).toHaveAttribute('aria-pressed', 'false');
    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
  });

  test('picking a replay start: a pan is not a pick, a line shows the bar, a click starts', async ({ page }) => {
    await open(page, 'i=US30&tf=5');
    await page.getByRole('button', { name: 'Start replay here' }).click();
    await pan(page, 0.4, 0.6);
    await expect(cursor(page)).toBeHidden();
    const box = await chart(page).boundingBox();
    if (!box) throw new Error('no chart');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(page.getByTestId('replay-pick-line')).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cursor(page)).toBeVisible();
  });

  test('Ctrl+Z and Ctrl+Y undo and redo drawings; the magnet cycles', async ({ page }) => {
    await open(page, 'i=US30&tf=5&at=2026-10-07T16:00:00.000Z');
    await page.keyboard.press('Alt+KeyH');
    const box = await chart(page).boundingBox();
    if (!box) throw new Error('no chart');
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await expect.poll(() => shownCount(page)).toBe(1);
    await page.keyboard.press('Control+KeyZ');
    await expect.poll(() => shownCount(page)).toBe(0);
    await page.keyboard.press('Control+KeyY');
    await expect.poll(() => shownCount(page)).toBe(1);
    // Redo re-created it under a new id; undo still finds it.
    await page.keyboard.press('Control+KeyZ');
    await expect.poll(() => shownCount(page)).toBe(0);

    const magnet = page.getByRole('button', { name: /magnet/i });
    await expect(magnet).toHaveAttribute('data-magnet', 'normal');
    await magnet.click();
    await expect(magnet).toHaveAttribute('data-magnet', 'weak_magnet');
    await magnet.click();
    await expect(magnet).toHaveAttribute('data-magnet', 'strong_magnet');
    await magnet.click();
    await expect(magnet).toHaveAttribute('data-magnet', 'normal');
  });
});
