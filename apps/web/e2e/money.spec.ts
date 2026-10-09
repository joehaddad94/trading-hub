import { expect, test } from '@playwright/test';
import { importFixture, requireAuth, signIn } from './support/auth';

requireAuth();

test.describe('money and rules (M10)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await importFixture(page);
  });

  test('shows the imported fee, adds a payout by hand and deletes it again', async ({ page }) => {
    await page.goto('/tracker/money');
    // The only real payment: the P1 challenge, bought with a 100% discount.
    await expect(page.getByTestId('cashflows')).toContainText('list $200.00, discount $199.99');
    const net = page
      .getByTestId('money-summary')
      .getByText(/Net prop result/)
      .locator('..');
    const before = await net.textContent();

    const note = `e2e payout ${Date.now().toString(36)}`;
    const form = page.getByRole('form', { name: 'Add cashflow' });
    await form.getByLabel('Type').selectOption('payout');
    await form.getByLabel('Amount $').fill('1500.25');
    await form.getByLabel('Note').fill(note);
    await form.getByRole('button', { name: 'Add' }).click();
    await expect(form.getByRole('status')).toContainText('Added.');
    await expect(page.getByTestId('cashflows')).toContainText(note);
    await expect(net).not.toHaveText(before ?? '');
    await expect(page.getByTestId('net-curve')).toBeVisible();

    const row = page.getByTestId('cashflows').getByRole('listitem').filter({ hasText: note });
    await expect(row).toContainText('$1,500.25');
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('cashflows')).not.toContainText(note);
    await expect(net).toHaveText(before ?? '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  });

  test('rule limits on the account page come from the imported export', async ({ page }) => {
    await page.goto('/tracker/accounts/7002880');
    await expect(page.getByTestId('rule-limits')).toContainText('from the export of');
    await expect(page.getByTestId('rule-limits')).toContainText('Daily loss limit');
  });
});
