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

/** The selected long/short box's [entry, stop, target] prices, as the chart reports its drawings. */
async function boxPrices(page: Page): Promise<number[]> {
  const raw = (await page.getByTestId('chart-area').getAttribute('data-drawings')) ?? '[]';
  const [box] = JSON.parse(raw) as { points: { price: number }[] }[];
  return (box?.points ?? []).map((p) => p.price);
}

/** Drags an order line (`<orderId>:sl` / `:tp`) by `dy` pixels. */
async function dragLine(page: Page, level: 'sl' | 'tp', dy: number) {
  // On a phone the trade list opens under the chart and the chart gets shorter: wait for the line to settle.
  let last: string | null = null;
  await expect
    .poll(async () => {
      const y = (await orderLines(page)).find((l) => l.key.endsWith(`:${level}`))?.y ?? null;
      const now = `${y}/${(await page.getByTestId('kline-chart').boundingBox())?.height}`;
      const settled = y !== null && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  const line = (await orderLines(page)).find((l) => l.key.endsWith(`:${level}`));
  const box = await page.getByTestId('kline-chart').boundingBox();
  if (!line?.y || !box) throw new Error(`no ${level} line`);
  await page.mouse.move(box.x + box.width * 0.6, box.y + line.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + line.y + dy, { steps: 5 });
  await page.mouse.up();
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

  // Other specs reuse the newest run: leave none behind.
  test.afterAll(async () => {
    await clearBacktestSessions();
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await clearDrawings();
    await clearBacktestSessions();
    await signIn(context, baseURL ?? '');
  });

  test('a long box opens at exactly its drawn levels, SL/TP drag, closes, shows in the tracker, deletes with undo', async ({
    page,
  }) => {
    await page.goto('/tracker/trades');
    const liveSummary = (await page.getByTestId('trades-summary').textContent()) ?? '';
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    await expect
      .poll(async () => (await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '')
      .not.toBe('');

    // Drawn away from the last close: the trade must still open exactly where it was drawn (Joe, 26 Oct 2026).
    await page.keyboard.press('Alt+KeyL');
    await clickChart(page, 0.7, 0.55);
    const [entry, stop, target] = (await boxPrices(page)).map((p) => p.toFixed(2));
    const buy = page.getByRole('button', { name: new RegExp(`^Buy ${entry} · [\\d.]+ lots$`) });
    await expect(buy).toBeVisible();
    await buy.click();
    // The trade list opens by itself on a new order: open at once, at the drawn levels, nothing moved.
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toHaveAttribute('data-status', 'open');
    await expect(rows(page).first()).toContainText(`@ ${entry}`);
    await expect(rows(page).first()).toContainText(`SL ${stop} · TP ${target}`);
    // The tool became the order.
    await expect
      .poll(async () => JSON.parse((await page.getByTestId('chart-area').getAttribute('data-drawings')) ?? '[]'))
      .toEqual([]);
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-order-marks', '1');
    // Its stop and target move by dragging their lines.
    await expect
      .poll(async () => (await orderLines(page)).map((l) => l.key.split(':')[1]).sort())
      .toEqual(['sl', 'tp']);
    await dragLine(page, 'tp', -25);
    await expect(rows(page).first()).not.toContainText(`TP ${target}`);
    expect(Number((await rows(page).first().textContent())?.match(/TP ([\d.]+)/)?.[1])).toBeGreaterThan(Number(target));
    await dragLine(page, 'sl', 15);
    await expect(rows(page).first()).not.toContainText(`SL ${stop}`);
    expect(Number((await rows(page).first().textContent())?.match(/SL ([\d.]+)/)?.[1])).toBeLessThan(Number(stop));
    // No stepping back with a trade open.
    const before = await page.getByTestId('replay-cursor').getAttribute('data-cursor');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('Close or cancel your open trades to step back.')).toBeVisible();
    await expect(page.getByTestId('replay-cursor')).toHaveAttribute('data-cursor', before ?? '');

    // Played forward, the stop or target is hit.
    await page.getByLabel('Bars per second').selectOption('20');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(rows(page).first()).toHaveAttribute('data-status', 'closed', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(rows(page).first()).toContainText(/R\)/);

    // The trade is a backtest trade in the tracker, not a live one.
    await page.goto('/tracker/trades?scope=backtest');
    await expect(page.getByTestId('trades-summary')).toContainText(/^1 trade/);
    await page.goto('/tracker/trades');
    await expect(page.getByTestId('trades-summary')).toHaveText(liveSummary);

    // Delete, undo, delete for good.
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await page.getByRole('button', { name: /Run \d+/ }).click();
    // The app's own confirm dialog; Escape cancels and keeps the trade.
    const confirm = page.getByRole('alertdialog', { name: 'Delete this backtest trade?' });
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await expect(confirm).toContainText('removed from all stats');
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(rows(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
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
    await page.getByRole('button', { name: /^Sell (limit|stop) order$/ }).click();
    await expect(rows(page).first()).toHaveAttribute('data-status', 'pending');
    // A pending order shows draggable entry, SL and TP lines.
    await expect.poll(async () => (await orderLines(page)).length).toBe(3);
    await rows(page).first().getByRole('button', { name: 'Cancel' }).click();
    await expect(rows(page)).toHaveCount(0);

    await page.keyboard.press('Alt+KeyL');
    await clickChart(page, 0.7, 0.5);
    await page.getByRole('button', { name: /^Buy [\d.]+ · [\d.]+ lots$/ }).click();
    await expect(rows(page).first()).toHaveAttribute('data-status', 'open');
    await rows(page).first().getByRole('button', { name: 'Break-even' }).click();
    await expect(rows(page).first()).toContainText(/SL (\S+) · TP/);
    const fill = (await rows(page).first().textContent())?.match(/@ ([\d.]+)/)?.[1];
    await expect(rows(page).first()).toContainText(`SL ${fill}`);

    // Drag the TP line up: the order's target moves with it.
    const tpBefore = (await rows(page).first().textContent())?.match(/TP ([\d.]+)/)?.[1];
    const tp = (await orderLines(page)).find((l) => l.key.endsWith(':tp'));
    const box = await page.getByTestId('kline-chart').boundingBox();
    if (!tp?.y || !box) throw new Error('no TP line');
    await page.mouse.move(box.x + box.width * 0.6, box.y + tp.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + tp.y - 25, { steps: 5 });
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

  test('Buy opens a ticket with lines on the chart; Enter places it, it fills at the next open, closes in parts', async ({
    page,
  }) => {
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    await expect
      .poll(async () => (await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '')
      .not.toBe('');
    const close = JSON.parse((await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '{}').close;

    // Sell shows the bid (last close), Buy the ask (plus spread).
    const trade = page.getByRole('group', { name: 'Trade' });
    await expect(trade.getByRole('button', { name: /^Sell/ })).toContainText(Number(close).toFixed(2));
    await trade.getByRole('button', { name: /^Buy/ }).click();
    const ticket = page.getByTestId('order-ticket');
    await expect(ticket).toHaveAttribute('data-kind', 'market');
    // Entry, stop and target preview lines, before anything is placed.
    await expect.poll(async () => (await orderLines(page)).filter((l) => l.key.startsWith('draft:')).length).toBe(3);
    await expect(rows(page)).toHaveCount(0);

    // Typing a stop updates the risk; Enter places the order.
    const stop = (Number(close) - 30).toFixed(2);
    await ticket.getByRole('textbox', { name: 'Stop loss' }).fill(stop);
    await ticket.getByRole('textbox', { name: 'Stop loss' }).press('Tab');
    await expect(ticket).toContainText('30.00 pts');
    await ticket.getByRole('textbox', { name: 'Stop loss' }).press('Enter');
    await expect(ticket).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('fills at next open');
    await expect(rows(page).first()).toContainText(`SL ${stop}`);
    // A market order waiting for the next open has no draggable entry line.
    await expect
      .poll(async () => (await orderLines(page)).map((l) => l.key.split(':')[1]).sort())
      .toEqual(['sl', 'tp']);

    await page.keyboard.press('ArrowRight');
    await expect(rows(page).first()).toHaveAttribute('data-status', 'open');
    await expect(page.getByTestId('order-open-pnl')).toHaveText(/^(\+|−)?\$\d/);
    // The SL/TP boxes start from the order as it is now (the fill moved the levels).
    const sl = (await rows(page).first().textContent())?.match(/SL ([\d.]+)/)?.[1];
    await rows(page).first().getByRole('button', { name: 'SL/TP' }).click();
    await expect(page.getByRole('textbox', { name: 'SL' })).toHaveValue(sl ?? '');
    await rows(page).first().getByRole('button', { name: 'SL/TP' }).click();

    // 50% in one tap, then the rest.
    await rows(page).first().getByRole('button', { name: 'Part' }).click();
    await page.getByRole('form', { name: 'Partial close' }).getByRole('button', { name: '50%' }).click();
    await expect(rows(page)).toHaveCount(2);
    await page.locator('[data-testid="order-row"][data-status="open"]').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('[data-testid="order-row"][data-status="closed"]')).toHaveCount(2);
  });

  test('Shift+S twice sells at market; a ticket dragged off the price becomes a limit, Esc closes it', async ({
    page,
  }) => {
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    await expect(page.getByTestId('kline-chart')).toHaveAttribute('data-ready', 'true');
    await expect
      .poll(async () => (await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '')
      .not.toBe('');
    await page.keyboard.press('Shift+S');
    await expect(page.getByTestId('order-ticket')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('order-ticket')).toHaveCount(0);

    // Drag the entry line of a buy ticket below the price: it becomes a buy limit.
    await page.keyboard.press('Shift+B');
    await expect(page.getByTestId('order-ticket')).toBeVisible();
    // On a phone the ticket opens under the chart and the chart gets shorter: wait for the line to settle inside it.
    let lastY: number | null = null;
    await expect
      .poll(async () => {
        const y = (await orderLines(page)).find((l) => l.key === 'draft:entry')?.y ?? null;
        const height = (await page.getByTestId('kline-chart').boundingBox())?.height ?? 0;
        const settled = y !== null && y === lastY && y < height;
        lastY = y;
        return settled;
      })
      .toBe(true);
    const entry = (await orderLines(page)).find((l) => l.key === 'draft:entry');
    const box = await page.getByTestId('kline-chart').boundingBox();
    if (!entry?.y || !box) throw new Error('no entry line');
    await page.mouse.move(box.x + box.width * 0.4, box.y + entry.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + entry.y + 20, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('order-ticket')).toHaveAttribute('data-kind', 'pending');
    await expect(page.getByTestId('order-ticket').getByRole('button', { name: /^Buy limit/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Shift+S');
    await page.keyboard.press('Shift+S');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Short');
    // Leave the run flat: later specs reuse the newest run, and an open trade changes how replay steps.
    await rows(page).first().getByRole('button', { name: 'Cancel' }).click();
    await expect(rows(page)).toHaveCount(0);
  });
  test('an open trade keeps the replay on its time: no Select bar, date change, Replay from here or Exit', async ({
    page,
  }) => {
    await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-ready', 'true');
    await expect(chart).toHaveAttribute('data-loading', '');
    await expect.poll(async () => (await chart.getAttribute('data-last-bar')) ?? '').not.toBe('');
    await page.keyboard.press('Shift+B');
    await page.keyboard.press('Shift+B');
    await expect(rows(page)).toHaveCount(1);
    await expect(async () => {
      await page.keyboard.press('ArrowRight');
      await expect(rows(page).first()).toHaveAttribute('data-status', 'open', { timeout: 1500 });
    }).toPass();
    const cursor = page.getByTestId('replay-cursor');
    const at = (await cursor.getAttribute('data-cursor')) ?? '';
    const refused = page.getByText('Close or cancel your open trades before replaying another time.');

    // B: no pick line.
    await page.keyboard.press('b');
    await expect(refused).toBeVisible();
    await expect(page.getByTestId('replay-pick-hint')).toHaveCount(0);
    // 📅: no date panel.
    await page.getByRole('button', { name: 'Change replay date' }).click();
    await expect(page.getByRole('dialog', { name: 'Replay from another date' })).toHaveCount(0);
    await expect(refused).toBeVisible();
    // Exit: still replaying on the same bar.
    await page.getByRole('button', { name: 'Exit replay' }).click();
    await expect(cursor).toHaveAttribute('data-cursor', at);
    // Right-click › Replay from here (desktop).
    const box = await chart.boundingBox();
    if (box && !test.info().project.name.includes('phone')) {
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Replay from here' }).click();
      await expect(cursor).toHaveAttribute('data-cursor', at);
      await expect(refused).toBeVisible();
    }

    // Opened without a time, the run comes back on the trade's time.
    await page.goto('/backtest/chart?i=US30&tf=5');
    await expect(cursor).toHaveAttribute('data-cursor', at);
    await expect(chart).toHaveAttribute('data-loading', '');

    // Closed, the replay can move again.
    if ((await rows(page).count()) === 0) await page.getByRole('button', { name: /open · / }).click();
    await rows(page).first().getByRole('button', { name: 'Close' }).click();
    await expect(rows(page).first()).toHaveAttribute('data-status', 'closed');
    await page.getByRole('button', { name: 'Exit replay' }).click();
    await expect(cursor).toBeHidden();
  });
});
