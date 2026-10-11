import { formatMonthParam, shiftMonth } from '@trading/core';
import type { CalendarMonthData, ScopeAccount } from '@trading/tracker/server';
import type { Route } from 'next';
import Link from 'next/link';
import { CalendarControls } from './calendar-controls';
import { CalendarGrid } from './calendar-grid';
import type { CellMode } from './search-params';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type CalendarLinks = {
  base: string;
  scope: string;
  cell: CellMode;
};

/** URL for the calendar with these params; defaults are left out so URLs stay short. */
export function calendarHref(links: CalendarLinks, params: { month?: string | null; day?: string | null }) {
  const q = new URLSearchParams();
  if (links.scope !== 'all') q.set('scope', links.scope);
  if (params.month) q.set('month', params.month);
  if (params.day) q.set('day', params.day);
  if (links.cell !== 'net') q.set('cell', links.cell);
  const s = q.toString();
  return s ? `${links.base}?${s}` : links.base;
}

/** The §8.2 calendar for any scope: month switcher, controls, grid. Used by the Calendar page and Overview. */
export function TrackerCalendar({
  data,
  accounts,
  links,
  selectedDay,
  today,
}: {
  data: CalendarMonthData;
  accounts: ScopeAccount[];
  links: CalendarLinks;
  selectedDay: string | null;
  today: string;
}) {
  const { year, month } = data.calendar;
  const monthParam = formatMonthParam(year, month);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const nav = 'flex h-11 min-w-11 items-center justify-center rounded-md hover:bg-accent md:h-9 md:min-w-9';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={calendarHref(links, { month: formatMonthParam(prev.year, prev.month) }) as Route}
            className={nav}
            aria-label="Previous month"
            scroll={false}
          >
            ‹
          </Link>
          <h3 className="min-w-36 text-center font-semibold" data-testid="calendar-month">
            {MONTHS[month - 1]} {year}
          </h3>
          <Link
            href={calendarHref(links, { month: formatMonthParam(next.year, next.month) }) as Route}
            className={nav}
            aria-label="Next month"
            scroll={false}
          >
            ›
          </Link>
          <Link
            href={calendarHref(links, { month: today.slice(0, 7) }) as Route}
            className="ml-1 flex h-11 items-center rounded-md border px-3 text-sm hover:bg-accent md:h-9"
            scroll={false}
          >
            Today
          </Link>
        </div>
        <CalendarControls month={monthParam} />
      </div>
      <CalendarGrid
        data={data}
        cell={links.cell}
        accounts={accounts}
        selectedDay={selectedDay}
        today={today}
        dayHref={(date) => calendarHref(links, { month: monthParam, day: date })}
      />
    </div>
  );
}
