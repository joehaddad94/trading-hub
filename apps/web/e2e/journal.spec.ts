import { expect, test } from '@playwright/test';
import { importFixture, requireAuth, signIn } from './support/auth';

requireAuth();

// Journals trades of the P2 demo account only, so the funded account's stats asserted elsewhere stay put.
const SCOPE = 'account:3028722';

test.describe('journal (M9)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await importFixture(page);
  });

  test('journals a trade in under a minute, then Save & next opens the next one', async ({ page }) => {
    await page.goto(`/tracker/journal?scope=${SCOPE}`);
    await expect(page.getByTestId('journal-pending-count')).toContainText('to journal');
    const started = Date.now();
    await page.getByTestId('journal-pending').getByRole('link').first().click();
    await expect(page.getByRole('form', { name: 'Journal' })).toBeVisible();
    const tradeUrl = page.url();
    await expect(page.getByTestId('trade-net')).toContainText('est.');

    // The hint under the SL field names the entry; put the stop 20 points on the losing side.
    const hint = (await page.getByText(/^(Below|Above) [\d.]+$/).textContent()) ?? '';
    const [, direction, entry] = hint.match(/^(Below|Above) ([\d.]+)$/) ?? [];
    const sl = (Number(entry) + (direction === 'Below' ? -20 : 20)).toFixed(2);

    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.getByLabel('Initial SL').fill(sl);
    await page.getByRole('group', { name: 'Feeling before' }).getByRole('button', { name: 'Calm' }).click();
    await page.getByRole('group', { name: 'Feeling after' }).getByRole('button', { name: 'Confident' }).click();
    await page.getByLabel('New mistake').fill('Late entry');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: '4 ★' }).click();
    await page.getByLabel('Notes').fill('Clean retest of the London high.');
    await page.getByRole('button', { name: 'Save & next' }).click();

    await expect(page).not.toHaveURL(tradeUrl);
    await expect(page).toHaveURL(/\/tracker\/trades\/[0-9a-f-]{36}$/);
    expect(Date.now() - started).toBeLessThan(60_000);

    // The saved trade now has a real R from the journaled stop.
    await page.goto(tradeUrl);
    await expect(page.getByTestId('trade-facts')).toContainText('journaled stop loss');
    await expect(page.getByTestId('trade-net')).not.toContainText('est.');
    await expect(page.getByLabel('Initial SL')).toHaveValue(sl);
    await expect(page.getByRole('button', { name: 'Late entry' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '4 ★' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Notes')).toHaveValue('Clean retest of the London high.');
  });

  test('the risk queue turns an estimated R into a real one in one tap, without journaling the trade', async ({
    page,
  }) => {
    await page.goto(`/tracker/journal?scope=${SCOPE}`);
    const toJournal = (await page.getByTestId('journal-pending-count').textContent()) ?? '';
    await page.getByRole('link', { name: 'Tag risk' }).click();
    await expect(page).toHaveURL(/view=risk/);
    const count = page.getByTestId('risk-queue-count');
    const before = Number((await count.textContent())?.match(/^(\d+)/)?.[1]);
    expect(before).toBeGreaterThan(0);

    // The oldest one, so the journal test (newest unjournaled trade) still starts from an estimate.
    const card = page.getByTestId('risk-card').last();
    const tradeHref = (await card.getByRole('link').getAttribute('href')) ?? '';
    await card.getByRole('button', { name: '1%' }).click();
    await expect(count).toContainText(`${before - 1} trade`);
    await expect(count).toContainText('1 tagged');

    await page.goto(tradeHref);
    await expect(page.getByTestId('trade-facts')).toContainText('planned or tagged risk');
    await expect(page.getByTestId('trade-net')).not.toContainText('est.');
    // Tagging risk is not journaling: the journal queue is unchanged.
    await page.goto(`/tracker/journal?scope=${SCOPE}`);
    await expect(page.getByTestId('journal-pending-count')).toHaveText(toJournal);

    // On the journal form, a risk % chip fills the planned risk $ field.
    await page.goto(tradeHref);
    const chip = page.getByRole('group', { name: /Risk %/ }).getByRole('button', { name: '0.5%' });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Planned risk $')).not.toHaveValue('');
  });

  test('refuses a stop loss on the wrong side of entry', async ({ page }) => {
    await page.goto(`/tracker/journal?scope=${SCOPE}`);
    await page.getByTestId('journal-pending').getByRole('link').first().click();
    const hint = (await page.getByText(/^(Below|Above) [\d.]+$/).textContent()) ?? '';
    const [, direction, entry] = hint.match(/^(Below|Above) ([\d.]+)$/) ?? [];
    const wrong = (Number(entry) + (direction === 'Below' ? 20 : -20)).toFixed(2);
    await page.getByLabel('Initial SL').fill(wrong);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('stop loss must be');
  });

  test('trades and the day view link to the trade journal; daily notes show on the heat map', async ({ page }) => {
    await page.goto('/tracker/trades?scope=account:3028722');
    await page.locator('a[href^="/tracker/trades/"]:visible').first().click();
    await expect(page).toHaveURL(/\/tracker\/trades\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('form', { name: 'Journal' })).toBeVisible();

    await page.goto('/tracker/calendar?month=2026-10&day=2026-10-01');
    await page.getByLabel('Notes').fill('Journal heat map note');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Note saved.' })).toBeVisible();

    await page.goto('/tracker/journal?view=notes&month=2026-10');
    await expect(page.getByTestId('notes-heatmap')).toBeVisible();
    await expect(page.getByTestId('notes-list')).toContainText('Journal heat map note');
    await expect(page.getByRole('link', { name: /2026-10-01 .*has a note/ })).toBeVisible();
  });

  test('settings manage journal tags, and a new setup shows on the form', async ({ page }) => {
    const name = `Setup ${Date.now().toString(36)}`;
    await page.goto('/settings');
    const form = page.getByRole('form', { name: 'Add setups tag' });
    await form.getByLabel('New setup tag').fill(name);
    await form.getByRole('button', { name: 'Add' }).click();
    await expect(form.getByRole('status')).toContainText('Tag added.');
    await page.reload();
    const row = page.getByRole('form', { name: `Tag ${name}` });
    await expect(row).toBeVisible();

    await page.goto(`/tracker/journal?scope=${SCOPE}`);
    await page.getByTestId('journal-pending').getByRole('link').first().click();
    await expect(page.getByLabel('Setup').locator('option', { hasText: name })).toHaveCount(1);

    await page.goto('/settings');
    await page
      .getByRole('form', { name: `Tag ${name}` })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('form', { name: `Tag ${name}` })).toHaveCount(0);
  });

  test('quick journal: one card per trade, Save & next and Skip (U6)', async ({ page }) => {
    await page.goto(`/tracker/journal?scope=${SCOPE}`);
    const before = Number((await page.getByTestId('journal-pending-count').textContent())?.match(/^(\d+)/)?.[1]);
    await page.getByRole('link', { name: 'Quick journal' }).click();
    await expect(page.getByTestId('quick-journal-progress')).toHaveText(/^1 of \d+/);
    const save = page.getByRole('button', { name: 'Save & next' });
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await save.click();
    await expect(page.getByTestId('quick-journal-progress')).toHaveText(/^2 of \d+/);
    await expect(page.getByTestId('quick-journal')).toContainText('1 saved');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByTestId('quick-journal-progress')).toHaveText(/^3 of \d+/);

    await page.goto(`/tracker/journal?scope=${SCOPE}`);
    await expect(page.getByTestId('journal-pending-count')).toContainText(`${before - 1} trade`);
  });
});
