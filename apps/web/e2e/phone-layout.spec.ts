import { expect, type Locator, type Page, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { clearBacktestSessions, clearDrawings, seedCandles } from './support/candles';
import { chartReady } from './support/chart';

requireAuth();

const AT = '2026-10-07T14:00:00.000Z';
const LANDSCAPE = { width: 839, height: 380 };
const rows = (page: Page) => page.getByTestId('order-row');

/** Fully on screen, so a tap reaches it without scrolling anything. */
async function onScreen(page: Page, target: Locator) {
  const box = await target.boundingBox();
  const vp = page.viewportSize();
  expect(box, 'no box').not.toBeNull();
  if (!box || !vp) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
}

async function open(page: Page) {
  await page.goto(`/backtest/chart?i=US30&tf=5&at=${AT}`);
  await chartReady(page);
  await expect
    .poll(async () => (await page.getByTestId('kline-chart').getAttribute('data-last-bar')) ?? '')
    .not.toBe('');
}

async function replayButtonsOnScreen(page: Page) {
  const row = page.getByRole('toolbar', { name: 'Replay' });
  // Nothing hides past the edge of the row.
  const { scroll, client } = await row.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  for (const name of ['Change replay date', 'Select bar', 'Play', 'Bar back', 'Bar', 'Exit replay']) {
    await onScreen(page, row.getByRole('button', { name, exact: true }));
  }
  await onScreen(page, row.getByRole('button', { name: '+1m' }));
}

test.describe('Backtest Lab on a phone (audit 25 Oct)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCandles(['2026-10-05', '2026-10-06', '2026-10-07']);
  });
  test.afterAll(async () => {
    await clearBacktestSessions();
  });
  test.beforeEach(async ({ context, baseURL }) => {
    await clearDrawings();
    await clearBacktestSessions();
    await signIn(context, baseURL ?? '');
  });

  test('landscape: every replay button fits, the ticket sits beside the chart, 📅 Start is reachable in full screen', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'phone layout');
    await page.setViewportSize(LANDSCAPE);
    await open(page);
    await replayButtonsOnScreen(page);

    // The ticket gets a column right of the chart; the chart keeps its height and the place button is on screen.
    const chart = page.getByTestId('kline-chart');
    const before = (await chart.boundingBox())?.height ?? 0;
    await page.getByRole('group', { name: 'Trade' }).getByRole('button', { name: /^Buy/ }).click();
    const ticket = page.getByTestId('ticket-column').getByTestId('order-ticket');
    await expect(ticket).toBeVisible();
    await expect(ticket).not.toHaveAttribute('data-compact', 'true');
    const place = ticket.getByRole('button', { name: /^Buy \d/ });
    await place.scrollIntoViewIfNeeded();
    await onScreen(page, place);
    expect((await chart.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(before - 1);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Full screen' }).first().click();
    await expect(page.locator('[data-full-screen="true"]')).toBeVisible();
    await replayButtonsOnScreen(page);
    await page.getByRole('button', { name: 'Change replay date' }).click();
    const panel = page.getByRole('dialog', { name: 'Replay from another date' });
    await panel.locator('[data-zone]').first().click();
    const start = panel.getByRole('button', { name: /^(Start|Restart)$/ });
    await onScreen(page, start);
    await start.click();
    await expect(panel).toBeHidden();
  });

  test('portrait: the one-row ticket keeps most of the chart and opens on a tap; Select bar sits in the replay row', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'phone layout');
    await open(page);
    await replayButtonsOnScreen(page);
    const chart = page.getByTestId('kline-chart');
    const before = (await chart.boundingBox())?.height ?? 0;
    await page.getByRole('group', { name: 'Trade' }).getByRole('button', { name: /^Buy/ }).click();
    const ticket = page.getByTestId('order-ticket');
    await expect(ticket).toHaveAttribute('data-compact', 'true');
    // The audit measured 271px of 504 with the old ticket open.
    await expect.poll(async () => (await chart.boundingBox())?.height ?? 0).toBeGreaterThan(before - 90);
    await onScreen(page, ticket.getByRole('button', { name: /^Buy \d/ }));
    await ticket.getByRole('button', { name: 'Edit order' }).click();
    await expect(page.getByRole('textbox', { name: 'Stop loss' })).toBeVisible();
    await page.getByRole('button', { name: 'Fewer details' }).click();
    await expect(page.getByTestId('order-ticket')).toHaveAttribute('data-compact', 'true');
    await page
      .getByTestId('order-ticket')
      .getByRole('button', { name: /^Buy \d/ })
      .click();
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByRole('button', { name: 'Cancel' }).click();
    await expect(rows(page)).toHaveCount(0);
  });

  test('a step pressed while the chart reloads a new date is kept, not dropped', async ({ page }) => {
    await open(page);
    const cursor = page.getByTestId('replay-cursor');
    await page.getByRole('button', { name: 'Change replay date' }).click();
    const panel = page.getByRole('dialog', { name: 'Replay from another date' });
    await panel.getByRole('button', { name: /Tuesday 6 October 2026/ }).click();
    await panel.getByRole('button', { name: /^(Start|Restart)$/ }).click();
    await expect(panel).toBeHidden();
    const started = Number(await cursor.getAttribute('data-cursor'));
    // Straight away, while the new window may still be loading.
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await cursor.getAttribute('data-cursor'))).toBeGreaterThan(started);
  });

  test('Close all asks first', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+B');
    await page.keyboard.press('Shift+B');
    await expect(rows(page)).toHaveCount(1);
    await page.keyboard.press('Shift+S');
    await page.keyboard.press('Shift+S');
    await expect(rows(page)).toHaveCount(2);
    const dialog = page.getByRole('alertdialog', { name: 'Close all 2 trades?' });
    await page.getByRole('button', { name: 'Close all' }).click();
    await expect(dialog).toContainText('cancel 2 pending orders');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-testid="order-row"][data-status="pending"]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Close all' }).click();
    await dialog.getByRole('button', { name: 'Close all' }).click();
    await expect(page.locator('[data-testid="order-row"][data-status="pending"]')).toHaveCount(0);
  });

  test('status lines shrink to dots in the header on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout');
    await open(page);
    const docked = page.locator('[data-dock="true"]');
    test.skip((await docked.count()) === 0, 'no sync or market-data warning in this database');
    for (const strip of await docked.all()) {
      const box = await strip.boundingBox();
      expect(box?.height ?? 99).toBeLessThanOrEqual(34);
      expect(box?.y ?? 99).toBeLessThan(44);
    }
  });
});
