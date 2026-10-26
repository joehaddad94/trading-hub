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

  test('the 15m forming candle updates minute by minute and nothing past the cursor is drawn', async ({ page }) => {
    const seen = watchCandles(page);
    await page.goto('/backtest/chart?i=US30&tf=15&at=2026-10-07T14:37:00.000Z');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:37:00Z')));
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T14:30:00Z'));
    expect((await lastBar(page))?.close).toBe(await minuteClose(page, '2026-10-07T14:37:00Z'));

    for (const minute of ['38', '39', '40']) {
      await page.keyboard.press('Alt+ArrowRight');
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

    // Chart windows stop at the cursor; 1m minutes ahead of it are only the in-memory replay buffer (Joe's
    // exception to spec §3.2, 21 Oct 2026), and the bars drawn above never passed the cursor.
    const finalCursor = Date.parse('2026-10-07T14:59:00Z');
    const windows = seen.filter((s) => s.tf !== 1);
    expect(windows.length).toBeGreaterThan(0);
    for (const s of windows) {
      expect(s.until).toBeLessThanOrEqual(finalCursor);
      expect(s.maxTs).toBeLessThanOrEqual(s.until);
    }
    // The steps came from the buffer: one or two 1m requests, not one per step.
    expect(seen.filter((s) => s.tf === 1).length).toBeLessThanOrEqual(2);
  });

  test('stepping keeps a panned chart where it is, like TradingView', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T14:37:00.000Z');
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-ready', 'true');
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T14:35:00Z'));
    // Drag the candles left so the newest bar sits mid-chart with room on its right.
    const box = await chart.boundingBox();
    if (!box) throw new Error('no chart');
    const y = box.y + box.height * 0.4;
    await page.mouse.move(box.x + box.width * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 8 });
    await page.mouse.up();
    const lastX = async () => Number(await chart.getAttribute('data-last-x'));

    await page.keyboard.press('ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:39:00Z')));
    const x1 = await lastX();
    await page.keyboard.press('ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:44:00Z')));
    const x2 = await lastX();
    // The new bar appears one bar to the right; the chart didn't scroll to put it at the edge.
    expect(x2 - x1).toBeGreaterThan(2);
    expect(x2).toBeLessThan(box.width * 0.8);

    await page.keyboard.press('ArrowLeft');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T14:39:00Z')));
    // Back puts the bars where they were (to a pixel; bar spacing can be fractional).
    await expect.poll(async () => Math.abs((await lastX()) - x1)).toBeLessThan(2);
  });

  test('steps back and forward, plays, keeps the cursor across timeframes and exits', async ({ page }) => {
    // One minute before NY PM opens (13:30 New York = 17:30 UTC).
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T17:29:00.000Z');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T17:29:00Z')));
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T17:25:00Z'));

    // One bar back (no trades open): the forming 17:25 bar disappears, then forward again.
    await page.keyboard.press('ArrowLeft');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-07T17:24:00Z')));
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-07T17:20:00Z'));
    // A step pressed while the previous one is loading is ignored, so wait for each.
    for (const minute of [25, 26, 27, 28, 29]) {
      await page.keyboard.press('Alt+ArrowRight');
      await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse(`2026-10-07T17:${minute}:00Z`)));
    }

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
    await expect(page.getByRole('toolbar', { name: 'Start replay' })).toBeVisible();
  });

  test('a new date whose candles fail to load says so, waits, and Retry loads it', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T14:37:00.000Z');
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-loading', '');
    // The connection drops for the new date's window.
    await page.route('**/api/backtest/candles?*tf=5*', (route) => route.abort('connectionfailed'));
    await page.getByRole('button', { name: 'Change replay date' }).click();
    await page.getByRole('button', { name: /^Tuesday 6 October 2026/ }).click();
    await page.locator('[data-zone="ny_am"]').click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const failed = page.getByRole('alert').filter({ hasText: 'Could not reach the server' });
    await expect(failed).toBeVisible();
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-loading', '');
    // A step can't run on a window that never loaded.
    await page.keyboard.press('Shift+ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-06T13:30:00Z')));

    await page.unroute('**/api/backtest/candles?*tf=5*');
    await failed.getByRole('button', { name: 'Retry' }).click();
    await expect(failed).toBeHidden();
    await expect.poll(async () => (await lastBar(page))?.ts).toBe(Date.parse('2026-10-06T13:30:00Z'));
    await page.keyboard.press('Shift+ArrowRight');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-06T13:34:00Z')));
  });

  test('the start panel: day, time and kill-zone shortcuts; a second pick keeps what you chose', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5');
    await page.getByRole('button', { name: 'Start replay' }).click();
    const panel = page.getByRole('dialog', { name: 'Start replay' });
    await expect(panel.getByTestId('start-tz')).toHaveText('Beirut time');
    // Weekends have no trading hours in Beirut time: greyed out and not pickable.
    await expect(panel.getByRole('button', { name: /^Saturday 3 October 2026/ })).toBeDisabled();
    await expect(panel.getByRole('button', { name: /^Sunday 4 October 2026/ })).toBeDisabled();
    await panel.getByRole('button', { name: /^Tuesday 6 October 2026/ }).click();
    // A kill zone fills the time; it doesn't start on its own.
    const nyAm = panel.locator('[data-zone="ny_am"]');
    await expect(nyAm).toHaveText(/NY AM.*16:30 · 09:30 NY/);
    await nyAm.click();
    await expect(panel.getByLabel('Start time')).toHaveValue('16:30');
    await expect(nyAm).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByTestId('start-ny')).toHaveText('09:30 NY');
    await panel.getByRole('button', { name: 'Start', exact: true }).click();
    // The replay bar reads the time you picked.
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-06T13:30:00Z')));
    await expect(cursor(page)).toContainText('16:30');
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Bar', exact: true }).click();

    // Second pick: the panel opens on the last start, not on where the replay has moved to.
    await page.getByRole('button', { name: 'Change replay date' }).click();
    const again = page.getByRole('dialog', { name: 'Replay from another date' });
    await expect(again.getByRole('button', { name: /^Tuesday 6 October 2026/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(again.getByLabel('Start time')).toHaveValue('16:30');
    await expect(again.getByRole('button', { name: 'Restart' })).toBeVisible();
    // Another day keeps the time.
    await again.getByRole('button', { name: /^Monday 5 October 2026/ }).click();
    await expect(again.getByLabel('Start time')).toHaveValue('16:30');
    await again.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-05T13:30:00Z')));

    // Another time keeps the day: type it and press Enter.
    await page.getByRole('button', { name: 'Change replay date' }).click();
    await page.getByLabel('Start time').fill('1015');
    await page.getByLabel('Start time').press('Enter');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-05T07:15:00Z')));

    // A time in the daily break moves to the next candle and says so.
    await page.getByRole('button', { name: 'Change replay date' }).click();
    await page.getByLabel('Start time').fill('23:30'); // 16:30 NY, after the 16:15 close
    await page.getByLabel('Start time').press('Enter');
    await expect(cursor(page)).toHaveAttribute('data-cursor', String(Date.parse('2026-10-05T22:00:00Z')));
    await expect(page.getByRole('status').filter({ hasText: 'Market closed then' })).toBeVisible();

    // A time that isn't one can't start.
    await page.getByRole('button', { name: 'Change replay date' }).click();
    await page.getByLabel('Start time').fill('25:00');
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();

    // Random lands on a kill-zone open inside the data.
    await page.getByRole('button', { name: 'Random' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(cursor(page)).toBeVisible();

    await page.getByRole('button', { name: 'Change replay date' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // After exit, Start replay opens on the last start too.
    await page.getByRole('button', { name: 'Exit replay' }).click();
    await page.getByRole('button', { name: 'Start replay' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Start replay' }).getByRole('button', { name: 'Start', exact: true }),
    ).toBeVisible();
  });

  test('Select bar: before and during replay, a time flag on the line, right-click or B cancels', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5');
    await page.getByRole('button', { name: 'Select bar' }).click();
    await expect(page.getByTestId('replay-pick-hint')).toHaveText(/Click a bar/); // U8
    const chart = page.getByTestId('kline-chart');
    const box = await chart.boundingBox();
    if (!box) throw new Error('no chart');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('replay-pick-flag')).toHaveText(/\d{2}:\d{2}/);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(cursor(page)).toBeVisible();
    const first = Number(await cursor(page).getAttribute('data-cursor'));
    expect((first / 60_000) % 5).toBe(4); // last minute of the clicked 5m bar
    await expect(page.getByTestId('replay-pick-hint')).toBeHidden();

    // During replay: the toolbar button (phones too), and right-click cancels instead of opening the menu.
    await page.getByRole('button', { name: 'Select bar' }).click();
    await expect(page.getByTestId('replay-pick-hint')).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2, { button: 'right' });
    await expect(page.getByTestId('replay-pick-hint')).toBeHidden();
    await expect(page.getByRole('menu')).toBeHidden();
    // B toggles it from the keyboard.
    await page.keyboard.press('b');
    await expect(page.getByTestId('replay-pick-hint')).toBeVisible();
    await page.keyboard.press('b');
    await expect(page.getByTestId('replay-pick-hint')).toBeHidden();
    // An earlier bar restarts the replay there.
    await page.keyboard.press('b');
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
    await expect.poll(async () => Number(await cursor(page).getAttribute('data-cursor'))).toBeLessThan(first);

    // U8: right-click › "Replay from here" starts at the bar under the pointer too.
    await page.getByRole('button', { name: 'Exit replay' }).click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Replay from here' }).click();
    await expect(cursor(page)).toBeVisible();
    expect((Number(await cursor(page).getAttribute('data-cursor')) / 60_000) % 5).toBe(4);
  });

  test('Select bar on a phone: a tap places the line, Start starts there, ✕ cancels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await page.goto('/backtest/chart?i=US30&tf=5');
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-ready', 'true');
    const box = await chart.boundingBox();
    if (!box) throw new Error('no chart');
    await page.getByRole('button', { name: 'Select bar' }).click();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // Placed, not started.
    const bar = page.getByRole('toolbar', { name: 'Replay start' });
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('replay-pick-flag')).toBeVisible();
    await expect(cursor(page)).toBeHidden();
    await bar.getByRole('button', { name: 'Cancel' }).click();
    await expect(bar).toBeHidden();
    await expect(page.getByTestId('replay-pick-line')).toBeHidden();

    await page.getByRole('button', { name: 'Select bar' }).click();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await bar.getByRole('button', { name: /^Start/ }).click();
    await expect(cursor(page)).toBeVisible();
    expect((Number(await cursor(page).getAttribute('data-cursor')) / 60_000) % 5).toBe(4);
  });
});
