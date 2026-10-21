import type { Page } from '@playwright/test';

/** On a phone the indicator, news, session and time controls sit behind "Chart settings"; open it there. */
export async function openChartSettings(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Chart settings' });
  if (!(await toggle.isVisible())) return;
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
