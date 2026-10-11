/**
 * One-off 12-month backfill of 1m candles (backtester spec §1.3). Idempotent (upserts on the PK) and
 * resumable (days with a good run are skipped), so just re-run it after an interruption.
 *
 *   DATABASE_URL_DIRECT=postgres://… pnpm tsx scripts/backfill-candles.ts [--from 2025-10-09] [--to 2026-10-08]
 *                                                                           [--only US30] [--force] [--pause 5]
 *
 * With AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY set it reads Dukascopy's S3 archive (the free feed now
 * refuses bulk downloads); without them it tries the free feed.
 */
import { createDb } from '@trading/db';
import { backfillWindow, type MarketDataProvider } from '@trading/market-data';
import { backfill, candleProvider } from '@trading/market-data/server';

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error('DATABASE_URL_DIRECT is required');

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const window = backfillWindow(new Date());
const from = flag('from') ?? window.from;
const to = flag('to') ?? window.to;
const only = flag('only');
// Dukascopy rate-limits bulk downloads (429/202), so space out the per-day requests.
const pauseMs = Number(flag('pause') ?? 0) * 1000;
const source = candleProvider();
const provider: MarketDataProvider = {
  name: source.name,
  async fetchMinuteCandles(code, dayFrom, dayTo) {
    if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return source.fetchMinuteCandles(code, dayFrom, dayTo);
  },
};

const db = createDb(url);
console.warn(
  `Backfilling ${only ?? 'all instruments'} from ${source.name}, ${from} → ${to}${pauseMs ? `, ${pauseMs / 1000}s between days` : ''}`,
);
const results = await backfill(db, provider, {
  from,
  to,
  codes: only ? only.split(',') : undefined,
  force: args.includes('--force'),
  onProgress: (r, done, total) =>
    console.warn(
      `[${done}/${total}] ${r.code} ${r.day}: ${r.status} ${r.rows} rows` +
        `${r.gaps.length ? `, ${r.gaps.length} gaps` : ''}${r.error ? ` — ${r.error}` : ''}`,
    ),
});
const failed = results.filter((r) => r.status === 'failed');
console.warn(
  `Done: ${results.length} day-runs, ${failed.length} failed.${failed.length ? ' Re-run to retry them.' : ''}`,
);
await db.$client.end();
process.exit(failed.length ? 1 : 0);
