import { expect, type Page, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { clearDrawings, seedCandles } from './support/candles';

requireAuth();

type Shown = { tool: string; points: { ts: number; price: number }[]; style: { lock: boolean } };

const area = (page: Page) => page.getByTestId('chart-area');
const shown = async (page: Page): Promise<Shown[]> =>
  JSON.parse((await area(page).getAttribute('data-drawings')) ?? '[]') as Shown[];

/**
 * Click inside the chart canvas at a fraction of its width and height. KLineCharts swallows a second click
 * within 500 ms that lands away from the first (it is neither a click nor a double click), so space them out.
 */
async function clickChart(page: Page, fx: number, fy: number) {
  await page.getByTestId('kline-chart').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('kline-chart').boundingBox();
  if (!box) throw new Error('chart not visible');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(550);
}

async function open(page: Page, tf = 5) {
  await page.goto(`/backtest/chart?i=US30&tf=${tf}&at=2026-10-07T16:00:00.000Z`);
  await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
  await expect
    .poll(async () => (await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '')
    .not.toBe('');
}

test.describe('drawings (M18)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCandles(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await clearDrawings();
    await signIn(context, baseURL ?? '');
  });

  test('every tool draws, saves, and survives a reload and a timeframe switch', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Alt+KeyH');
    await clickChart(page, 0.3, 0.3);
    await expect.poll(async () => (await shown(page)).length).toBe(1);

    await page.getByRole('button', { name: 'Trend line' }).click();
    await clickChart(page, 0.2, 0.6);
    await clickChart(page, 0.5, 0.4);
    await expect.poll(async () => (await shown(page)).length).toBe(2);

    await page.keyboard.press('Alt+KeyL');
    await clickChart(page, 0.6, 0.5);
    await expect.poll(async () => (await shown(page)).length).toBe(3);

    await page.keyboard.press('Alt+KeyS');
    await clickChart(page, 0.4, 0.5);
    await expect.poll(async () => (await shown(page)).length).toBe(4);

    const before = await shown(page);
    expect(before.map((d) => d.tool).sort()).toEqual(['horizontal', 'long', 'short', 'trend']);
    const long = before.find((d) => d.tool === 'long');
    expect(long?.points).toHaveLength(3);
    // Long: stop below entry, target above.
    const [entry, stop, target] = long?.points ?? [];
    expect(stop?.price).toBeLessThan(entry?.price ?? 0);
    expect(target?.price).toBeGreaterThan(entry?.price ?? 0);

    const key = (list: Shown[]) =>
      list.map((d) => `${d.tool}:${d.points.map((p) => `${p.ts}@${p.price}`).join(',')}`).sort();

    await page.reload();
    await expect.poll(async () => key(await shown(page))).toEqual(key(before));

    await page.getByRole('button', { name: '15m', exact: true }).click();
    await expect(page).toHaveURL(/tf=15/);
    await expect.poll(async () => key(await shown(page))).toEqual(key(before));
  });

  test('a measure without Shift is temporary; with Shift it is kept', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Alt+KeyM');
    await clickChart(page, 0.3, 0.6);
    await clickChart(page, 0.5, 0.4);
    // Not saved, and cleared by the next plain click.
    await page.waitForTimeout(400);
    expect(await shown(page)).toHaveLength(0);

    await page.keyboard.press('Alt+KeyM');
    await clickChart(page, 0.3, 0.6);
    await page.keyboard.down('Shift');
    await clickChart(page, 0.5, 0.4);
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await shown(page)).map((d) => d.tool)).toEqual(['measure']);
  });

  test('delete one, then delete all', async ({ page }) => {
    await open(page);
    for (const y of [0.3, 0.5]) {
      await page.keyboard.press('Alt+KeyH');
      await clickChart(page, 0.5, y);
    }
    await expect.poll(async () => (await shown(page)).length).toBe(2);

    await page.reload();
    await expect.poll(async () => (await shown(page)).length).toBe(2);
    const props = page.getByRole('group', { name: 'Drawing properties' });
    // Same data and viewport after the reload, so the line is where it was drawn: click it to select.
    await clickChart(page, 0.7, 0.3);
    await expect(props).toBeVisible();
    await props.getByRole('button', { name: 'Delete drawing' }).click();
    await expect.poll(async () => (await shown(page)).length).toBe(1);

    await page.reload();
    await expect.poll(async () => (await shown(page)).length).toBe(1);

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Delete all drawings' }).click();
    await expect.poll(async () => (await shown(page)).length).toBe(0);
    await page.reload();
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    expect(await shown(page)).toHaveLength(0);
  });
});
