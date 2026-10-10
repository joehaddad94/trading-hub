import { expect, test } from '@playwright/test';
import { importFixture, requireAuth, signIn } from './support/auth';
import { seedCandles } from './support/candles';

requireAuth();

test.describe('news markers on replay (M17)', () => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not set');

  test.beforeAll(async () => {
    await seedCandles(['2026-10-06', '2026-10-07']);
  });

  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? '');
    await importFixture(page);
  });

  test('scheduled events ahead of the cursor show as markers; toggles filter them', async ({ page }) => {
    const responses: { until: string; titles: string[]; actuals: (string | null)[] }[] = [];
    page.on('response', async (r) => {
      const url = new URL(r.url());
      if (url.pathname !== '/api/backtest/events' || !r.ok()) return;
      const body = (await r.json()) as { data: { title: string; actual: string | null }[] };
      responses.push({
        until: url.searchParams.get('until') ?? '',
        titles: body.data.map((e) => e.title),
        actuals: body.data.map((e) => e.actual),
      });
    });
    // Cursor before the FOMC minutes (7 Oct 18:00 UTC): the event is scheduled, so it may be shown.
    await page.goto('/backtest/chart?i=US30&tf=15&at=2026-10-07T14:37:00.000Z');
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-markers', '1');
    expect(responses[0]?.until).toBe('2026-10-07T14:37:00.000Z');
    expect(responses[0]?.titles).toContain('FOMC Meeting Minutes');
    expect(responses.flatMap((r) => r.actuals).every((a) => a === null)).toBe(true);

    await page.getByRole('button', { name: 'Med impact news' }).click();
    await expect.poll(async () => Number(await chart.getAttribute('data-markers'))).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'High impact news' }).click();
    await page.getByRole('button', { name: 'Med impact news' }).click();
    await expect(chart).toHaveAttribute('data-markers', '0');
    await page.getByRole('button', { name: 'High impact news' }).click();
    await expect(chart).toHaveAttribute('data-markers', '1');
  });

  test('hovering the marker shows the event card', async ({ page }) => {
    await page.goto('/backtest/chart?i=US30&tf=5&at=2026-10-07T19:30:00.000Z');
    const chart = page.getByTestId('kline-chart');
    await expect(chart).toHaveAttribute('data-markers', '1');
    const box = await chart.boundingBox();
    if (!box) throw new Error('no chart');
    const card = page.getByRole('status', { name: 'News at this bar' });
    for (let x = box.x + 10; x < box.x + box.width - 70 && !(await card.isVisible()); x += 4) {
      await page.mouse.move(x, box.y + box.height / 2);
    }
    await expect(card).toContainText('USD · FOMC Meeting Minutes');
    await expect(card).toContainText('7 Oct 2026 21:00'); // 18:00 UTC in Beirut
    await page.mouse.move(box.x + 5, box.y - 40);
    await expect(card).toBeHidden();
  });

  test('the events API never returns an actual after until', async ({ page }) => {
    const res = await page.request.get(
      '/api/backtest/events?from=2026-10-01T00:00:00Z&to=2026-10-10T00:00:00Z&until=2026-10-07T14:37:00Z&impact=high,medium,low&currency=USD',
    );
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as { data: { eventAt: string; actual: string | null }[] };
    expect(data.length).toBeGreaterThan(1);
    for (const e of data) if (Date.parse(e.eventAt) > Date.parse('2026-10-07T14:37:00Z')) expect(e.actual).toBeNull();
    expect((await page.request.get('/api/backtest/events?from=x&to=y&until=z&impact=high')).status()).toBe(400);
  });
});
