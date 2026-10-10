import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { listInstruments, loadBars, nextMinuteAt } from '@trading/market-data/server';
import { chartEvents, getNewsSettings } from '@trading/news/server';
import { connection } from 'next/server';
import { getDb } from '@/lib/server/db';
import type { BarsQuery, ChartEvent, EventsQuery } from '../lib/bars-query';

export type ChartInstrument = { code: string; displayName: string; priceDigits: number; pointValue: string };

export async function getChartInstruments(): Promise<ChartInstrument[]> {
  await connection();
  const db = getDb();
  if (!db) return [];
  const list = await listInstruments(db);
  return list.map((i) => ({
    code: i.code,
    displayName: i.displayName,
    priceDigits: i.priceDigits,
    pointValue: i.pointValuePerLot,
  }));
}

/** Candle window for the chart. `until` is clamped to now: the chart never asks for the future either. */
export async function getBars(query: BarsQuery, now = new Date()) {
  const db = getDb();
  if (!db) return { ok: false as const, error: 'DATABASE_URL is not configured.' };
  try {
    const until = query.until.getTime() > now.getTime() ? now : query.until;
    const page = await loadBars(db, {
      code: query.instrument,
      tf: query.tf,
      until,
      before: query.before,
      after: query.after,
      count: query.count,
    });
    return page ? { ok: true as const, data: page } : { ok: false as const, error: 'Unknown instrument.' };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false as const, error: 'Could not load candles.' };
  }
}

export async function getNextMinute(code: string, after: Date) {
  const db = getDb();
  if (!db) return { ok: false as const, error: 'DATABASE_URL is not configured.' };
  try {
    const ts = await nextMinuteAt(db, code, after);
    return { ok: true as const, data: { ts: ts?.toISOString() ?? null } };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false as const, error: 'Could not look up the next candle.' };
  }
}

/** `until` is clamped to now, like candles: an actual is only ever shown once its release has passed. */
export async function getChartEvents(query: EventsQuery, now = new Date()) {
  const db = getDb();
  if (!db) return { ok: false as const, error: 'DATABASE_URL is not configured.' };
  try {
    const until = query.until.getTime() > now.getTime() ? now : query.until;
    const events = await chartEvents(
      db,
      { from: query.from, to: query.to, impacts: query.impact, currencies: query.currency },
      until,
    );
    const data: ChartEvent[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      currency: e.currency,
      impact: e.impact,
      eventAt: e.eventAt.toISOString(),
      forecast: e.forecast,
      previous: e.previous,
      actual: e.actual,
      isRestricted: e.isRestricted,
    }));
    return { ok: true as const, data };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false as const, error: 'Could not load news events.' };
  }
}

/** Currencies that count (News › Restriction rules) — the chart's default marker filter. */
export async function getCountedCurrencies(): Promise<string[]> {
  const db = getDb();
  if (!db) return ['USD'];
  return (await getNewsSettings(db)).currencies;
}
