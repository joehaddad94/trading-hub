import { expect, test } from '@playwright/test';
import { requireAuth, signIn } from './support/auth';
import { clearBacktestSessions, clearDrawings, seedCandles } from './support/candles';
import { chartReady } from './support/chart';

requireAuth();

const AT = '2026-10-07T14:00:00.000Z';

test.describe('backtest sessions (M21)', () => {
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

  test('create a session, trade nothing, resume where replay stopped, edit, complete and delete it', async ({
    page,
  }) => {
    await page.goto('/backtest');
    await expect(page.getByText('No runs yet')).toBeVisible();
    const form = page.getByRole('form', { name: 'New run' });
    await form.getByLabel('Name').fill('London breakouts');
    await form.getByLabel('Starting balance $').fill('50000');
    await form.getByLabel('Risk per trade %').fill('1');
    await form.getByRole('button', { name: 'Create and open chart' }).click();
    await expect(page).toHaveURL(/\/backtest\/chart\?session=[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: /London breakouts/ })).toBeVisible();

    // Replay a few bars; with nothing open the cursor is saved once replay is still.
    await page.goto(`${page.url()}&i=US30&tf=5&at=${AT}`);
    await chartReady(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1_800);
    const cursor = new URL(page.url()).searchParams.get('at') ?? '';
    expect(cursor).not.toBe(AT);

    await page.getByRole('link', { name: 'Stats' }).click();
    await expect(page.getByRole('heading', { name: 'London breakouts' })).toBeVisible();
    await expect(page.getByText(/risk 1(\.00)?% of \$50,000\.00/)).toBeVisible();
    await expect(page.getByText(/replay at 7 Oct 2026, 17:0\d/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Resume' })).toHaveAttribute(
      'href',
      new RegExp(`at=${encodeURIComponent(cursor)}`),
    );

    const settings = page.getByRole('form', { name: 'Run settings' });
    await settings.getByLabel('Name').fill('London ORB');
    await settings.getByRole('button', { name: 'Save' }).click();
    await expect(settings.getByRole('status')).toHaveText('Saved.');
    await expect(page.getByRole('heading', { name: 'London ORB' })).toBeVisible();

    await page.getByRole('button', { name: 'Complete run' }).click();
    await expect(page.getByText('Run completed.')).toBeVisible();
    await page.goto('/backtest');
    await expect(page.getByTestId('session-row')).toHaveCount(1);
    await expect(page.getByTestId('session-row')).toContainText('Completed');

    await page.getByTestId('session-row').getByRole('link').click();
    await page.getByText('Delete run…').click();
    await page.getByRole('button', { name: 'Delete for good' }).click();
    await expect(page).toHaveURL(/\/backtest$/);
    await expect(page.getByTestId('session-row')).toHaveCount(0);
  });

  test('analytics and live vs backtest render for the live scope', async ({ page }) => {
    await page.goto('/tracker/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    const empty = page.getByText('No closed trades in scope.');
    if (!(await empty.isVisible())) {
      await expect(page.getByTestId('r-histogram')).toBeVisible();
      await expect(page.getByTestId('streaks')).toContainText('Longest win run');
      await expect(page.getByTestId('by-symbol')).toContainText('US30');
      await expect(page.getByTestId('by-session')).toBeVisible();
    }
    await page.getByRole('link', { name: 'Compare with backtests' }).click();
    await expect(page.getByRole('heading', { name: 'Live vs backtest' })).toBeVisible();
    await expect(page.getByText(/live trades \(the selected scope\) against 0 backtest trades/)).toBeVisible();
  });
});
