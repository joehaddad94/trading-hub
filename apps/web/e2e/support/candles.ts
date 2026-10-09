import { createDb } from '@trading/db';
import { isMarketOpen, type MarketDataProvider, type RawCandle } from '@trading/market-data';
import { ingestDay } from '@trading/market-data/server';

/** Deterministic synthetic 1m candles, written through the real ingest path (idempotent). */
export const syntheticProvider: MarketDataProvider = {
  name: 'dukascopy',
  async fetchMinuteCandles(code, from, to) {
    const base = code === 'usa30idxusd' ? 46000 : 24000;
    const rows: RawCandle[] = [];
    for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
      if (!isMarketOpen(new Date(t))) continue;
      const i = t / 60_000;
      const open = base + Math.round(Math.sin(i / 90) * 400) / 4;
      const close = open + ((i % 9) - 4) * 0.5;
      rows.push({
        timestamp: t,
        open,
        high: Math.max(open, close) + 2,
        low: Math.min(open, close) - 1.5,
        close,
        volume: 1,
      });
    }
    return rows;
  },
};

export async function seedCandles(days: string[]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const db = createDb(url);
  try {
    for (const day of days) await ingestDay(db, syntheticProvider, day, { trigger: 'e2e' });
  } finally {
    await db.$client.end();
  }
}
