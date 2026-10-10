import { expect, type Page, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { seedCandles } from './support/candles';

requireAuth();

type Bar = { ts: number; close: number };
type Seen = { until: number; tf: number; maxTs: number };

function watchCandles(page: Page): Seen[] {
  const seen: Seen[] = [];
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== '/api/backtest/candles' || !response.ok()) return;
    const body = (await response.json()) as { data: { bars: Bar[] } };
    seen.push({
      until: Date.parse(url.searchParams.get('until') ?? ''),
      tf: Number(url.searchParams.get('tf')),
      maxTs: Math.max(...body.data.bars.map((b) => b.ts), 0),
    });
  });
  return seen;
}

const cursor = (page: Page) => page.getByTestId('replay-cursor');
const lastBar = async (page: Page): Promise<Bar | null> => {
  const raw = await page.getByTestId('kline-chart').getAttribute('data-last-bar');
  return raw ? (JSON.parse(raw) as Bar) : null;
};

async function minuteClose(page: Page, iso: string) {
  const res = await page.request.get(`/api/backtest/candles?instrument=US30&tf=1&until=${iso}&count=1`);
  return ((await res.json()) as { data: { bars: Bar[] } }).data.bars[0]?.close;
}

test.describe('replay (M16)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeAll(async () => {
    await seedCandles(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL ?? '');
  });

  test('the 15m forming candle updates minute by minute and nothing past the cursor is fetched', async ({ page }) => {
    const seen = watchCandles(page);
    await page.goto('/backtest/chart?i=US30&tf=15&at=2026-10-07T14:37:00.000Z');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:37:00Z')));
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T14:30:00Z'));
    expect((await lastBar(page))?.close).toBe(await minuteClose(page, '2026-10-07T14:37:00Z'));

    for (const minute of ['38', '39', '40']) {
      await page.keyboard.press('Shift+ArrowRight');
      const at = `2026-10-07T14:${minute}:00Z`;
      await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse(at)));
      const expected = await minuteClose(page, at);
      await expect.poll(async () => (await lastBar(page))?.close).toBe(expected);
      expect((await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T14:30:00Z'));
    }

    await page.keyboard.press('ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:44:00Z')));
    await page.keyboard.press('ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:59:00Z')));
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T14:45:00Z'));
    await expect(page).toHaveURL(/at=2026-10-07T14(%3A|:)59/);

    // Every candles response stayed at or before the cursor of its moment.
    const finalCursor = Date.parse('2026-10-07T14:59:00Z');
    expect(seen.length).toBeGreaterThan(3);
    for (const s of seen) {
      expect(s.until).toBeLessThanOrEqual(finalCursor);
      expect(s.maxTs).toBeLessThanOrEqual(s.until);
    }
  });

  test('jumps to the next session, plays, keeps the cursor across timeframes and exits', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T14:37:00.000Z');
    await expect(cursor(page)).toBeVisible();
    await page.getByRole('button', { name: 'Next session' }).click();
    // NY PM opens 13:30 New York = 17:30 UTC; the cursor sits one minute before.
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T17:29:00Z')));
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T17:25:00Z'));

    await page.keyboard.press('f');
    await expect(page).toHaveURL(/tf=15/);
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T17:15:00Z'));
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T17:29:00Z')));

    await page.getByLabel('Bars per second').selectOption('10');
    await page.keyboard.press('Space');
    await expect
      .poll(async () => Number(await cursor(page).getAttribute('data-cursor')))
      .toBeGreaterThan(Date.parse('2026-10-07T18:30:00Z'));
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Exit replay' }).click();
    await expect(page).not.toHaveURL(/at=/);
    await expect(page.getByRole('form', { name: 'Start replay' })).toBeVisible();
  });

  test('starts from a date and time or a clicked candle', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5');
    await page.getByLabel('Replay start').fill('2026-10-06T17:00');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    // 17:00 Beirut = 14:00 UTC.
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-06T14:00:00Z')));
    await page.getByRole('button', { name: 'Exit replay' }).click();

    await page.getByRole('button', { name: 'Start replay here' }).click();
    const chart = page.getByTestId('kline-chart');
    const box = await chart.boundingBox();
    if (!box) throw new Error('no chart');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(cursor(page)).toBeVisible();
    const at = Number(await cursor(page).getAttribute('data-cursor'));
    expect((at / 60_000) % 5).toBe(4); // last minute of the clicked 5m bar
  });
});
