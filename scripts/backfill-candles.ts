/**
 * One-off 12-month backfill of 1m candles (backtester spec §1.3). Idempotent (upserts on the PK) and
 * resumable (days with a good run are skipped), so just re-run it after an interruption.
 *
 *   DATABASE_URL_DIRECT=postgres://… pnpm tsx scripts/backfill-candles.ts [--from 2025-10-09] [--to 2026-10-08]
 *                                                                           [--only US30] [--force] [--pause 5]
 *
 * Reads Dukascopy's S3 bucket when keys are available: DUKASCOPY_S3_ACCESS_KEY_ID / DUKASCOPY_S3_SECRET_ACCESS_KEY,
 * else the [default] profile in ~/.aws/credentials. Without keys it falls back to the free datafeed.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@trading/db';
import { backfillWindow, type MarketDataProvider } from '@trading/market-data';
import { backfill, marketDataProvider } from '@trading/market-data/server';

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
// The free datafeed rate-limits bulk downloads (429/202), so allow spacing out the per-day requests.
const pauseMs = Number(flag('pause') ?? 0) * 1000;

function awsProfileCredentials(): { accessKeyId?: string; secretAccessKey?: string } {
  try {
    const ini = readFileSync(join(homedir(), '.aws', 'credentials'), 'utf8');
    const profile = ini.split(/^\[/m).find((s) => s.startsWith('default]')) ?? '';
    const value = (key: string) => new RegExp(`^${key}\\s*=\\s*(\\S+)`, 'm').exec(profile)?.[1];
    return { accessKeyId: value('aws_access_key_id'), secretAccessKey: value('aws_secret_access_key') };
  } catch {
    return {};
  }
}
const credentials = process.env.DUKASCOPY_S3_ACCESS_KEY_ID
  ? { accessKeyId: process.env.DUKASCOPY_S3_ACCESS_KEY_ID, secretAccessKey: process.env.DUKASCOPY_S3_SECRET_ACCESS_KEY }
  : awsProfileCredentials();
const source = marketDataProvider(credentials);
const viaS3 = Boolean(credentials.accessKeyId && credentials.secretAccessKey);
const provider: MarketDataProvider = {
  name: source.name,
  async fetchMinuteCandles(code, dayFrom, dayTo) {
    if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return source.fetchMinuteCandles(code, dayFrom, dayTo);
  },
};

const db = createDb(url);
console.warn(
  `Backfilling ${only ?? 'all instruments'} ${from} → ${to} from ${viaS3 ? 'Dukascopy S3' : 'the free datafeed'}` +
    `${pauseMs ? `, ${pauseMs / 1000}s between days` : ''}`,
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
