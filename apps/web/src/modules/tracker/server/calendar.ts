import 'server-only';
import { formatMonthParam, parseMonth, tradingDay } from '@trading/core';
import { calendarDay, calendarMonth, type ResolvedScope, saveDailyNote } from '@trading/tracker/server';
import type { SearchParams } from 'nuqs/server';
import { getDb } from '@/lib/server/db';
import { loadCalendarSearchParams } from '../calendar/search-params';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Month, open day and cell mode from the URL; the month defaults to today's (Beirut). */
export async function readCalendarParams(searchParams: Promise<SearchParams>, now = new Date()) {
  const { month, day, cell } = await loadCalendarSearchParams(searchParams);
  const today = tradingDay(now);
  const fallback = parseMonth(today.slice(0, 7)) ?? { year: 2026, month: 1 };
  const shown = parseMonth(month) ?? fallback;
  const openDay = day && DAY.test(day) && !Number.isNaN(Date.parse(day)) ? day : null;
  return { ...shown, monthParam: formatMonthParam(shown.year, shown.month), day: openDay, cell, today };
}

export async function getCalendarMonth(scope: ResolvedScope, year: number, month: number, now = new Date()) {
  const db = getDb();
  if (!db) return null;
  return calendarMonth(db, scope, { year, month, now });
}

export async function getCalendarDay(scope: ResolvedScope, date: string) {
  const db = getDb();
  if (!db) return null;
  return calendarDay(db, scope, date);
}

export async function writeDailyNote(
  date: string,
  note: { notes: string | null; mood: string | null; marketContext: string | null },
) {
  const db = getDb();
  if (!db) throw new Error('The database is not configured.');
  await saveDailyNote(db, date, note);
}
