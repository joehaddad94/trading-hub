import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { weekRange } from '@trading/core';
import type { NewsFilters } from '@trading/news';
import {
  accountRestrictions,
  eventDetail,
  eventTitles,
  getNewsSettings,
  lastNewsSync,
  listEvents,
  type NewsHubSummary,
  type NewsSettings,
  newsHubSummary,
  occurrences,
  saveNewsSettings,
  setAccountRestriction,
} from '@trading/news/server';
import { connection } from 'next/server';
import { getDb } from '@/lib/server/db';

export async function getWeek(monday: string, filters: NewsFilters) {
  await connection();
  const db = getDb();
  if (!db) return null;
  const { start, end } = weekRange(monday);
  const [events, lastSync] = await Promise.all([
    listEvents(db, {
      from: start,
      to: end,
      impacts: filters.impacts,
      currencies: filters.currencies,
      restrictedOnly: filters.restrictedOnly,
    }),
    lastNewsSync(db),
  ]);
  return { events, lastSync };
}

export async function getEventDetail(id: string, now = new Date()) {
  const db = getDb();
  return db ? eventDetail(db, id, now) : null;
}

export async function getEventTitles(search: string | undefined, currencies: string[]) {
  await connection();
  const db = getDb();
  return db ? eventTitles(db, { search, currencies }) : [];
}

export async function getOccurrences(title: string, currency: string) {
  const db = getDb();
  return db ? occurrences(db, title, currency) : [];
}

export async function getNewsSettingsOrDefault(): Promise<NewsSettings> {
  await connection();
  const db = getDb();
  return db ? getNewsSettings(db) : { minutesBefore: 5, minutesAfter: 5, currencies: ['USD'] };
}

export async function writeNewsSettings(s: NewsSettings) {
  const db = getDb();
  if (!db) throw new Error('The database is not configured.');
  await saveNewsSettings(db, s);
}

/** News card numbers for the hub (news spec §3). Null when there is no database or the query fails. */
export async function getNewsHubSummary(now = new Date()): Promise<NewsHubSummary | null> {
  const db = getDb();
  if (!db) return null;
  try {
    return await newsHubSummary(db, now);
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}

export async function getAccountRestrictions() {
  await connection();
  const db = getDb();
  return db ? accountRestrictions(db) : [];
}

export async function writeAccountRestriction(accountId: string, value: boolean | null) {
  const db = getDb();
  if (!db) throw new Error('The database is not configured.');
  await setAccountRestriction(db, accountId, value);
}
