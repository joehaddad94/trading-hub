/**
 * One-minute check of Dukascopy's S3 archive before a backfill: is each instrument there, and do its prices
 * decode to sane values? Needs AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the environment. Reads only.
 *
 *   pnpm candles:probe [2026-01-05]
 */
import { ticksToMinuteCandles } from '@trading/market-data';
import { decodeDayFile, dukascopyKey, fetchDayFile, listDukascopySymbols } from '@trading/market-data/server';

const day = process.argv[2] ?? '2026-01-05';
const codes = ['usa30idxusd', 'usatechidxusd'];

const symbols = await listDukascopySymbols();
console.warn(`${symbols.length} symbols in the bucket: ${symbols.join(', ')}`);

let ok = true;
for (const code of codes) {
  const key = dukascopyKey(code, day);
  const file = await fetchDayFile(code, day);
  if (!file) {
    console.warn(`✗ ${code}: no file at ${key}`);
    ok = false;
    continue;
  }
  const ticks = decodeDayFile(code, day, file);
  const candles = ticksToMinuteCandles(ticks);
  const first = candles[0];
  const last = candles.at(-1);
  console.warn(
    `✓ ${code}: ${key} ${file.byteLength} bytes → ${ticks.length} ticks, ${candles.length} minutes; ` +
      `first ${first ? `${new Date(first.timestamp).toISOString()} bid ${first.open}` : '—'}, ` +
      `last ${last ? `${new Date(last.timestamp).toISOString()} bid ${last.close}` : '—'}`,
  );
}
process.exit(ok ? 0 : 1);
