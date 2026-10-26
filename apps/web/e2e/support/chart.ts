import { expect, type Page } from '@playwright/test';

/** The chart has drawn and finished loading its window (data-ready turns true before the first load ends). */
export async function chartReady(page: Page): Promise<void> {
  const chart = page.getByTestId('kline-chart');
  await expect(chart).toHaveAttribute('data-ready', 'true');
  await expect(chart).toHaveAttribute('data-loading', '');
}
