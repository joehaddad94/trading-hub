import type { SearchParams } from 'nuqs/server';
import { DayView } from '@/modules/tracker/calendar/day-view';
import { MonthSummary } from '@/modules/tracker/calendar/month-summary';
import { calendarHref, TrackerCalendar } from '@/modules/tracker/calendar/tracker-calendar';
import { ScopeNotice } from '@/modules/tracker/components/scope-notice';
import { getCalendarDay, getCalendarMonth, readCalendarParams } from '@/modules/tracker/server/calendar';
import { getPageScope } from '@/modules/tracker/server/scope';
import { saveDailyNoteAction } from './actions';

/** Trading calendar (tracker spec §8.2). */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getPageScope(searchParams);
  if (!scope) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const params = await readCalendarParams(searchParams);
  const [data, detail] = await Promise.all([
    getCalendarMonth(scope, params.year, params.month),
    params.day ? getCalendarDay(scope, params.day) : null,
  ]);
  if (!data) return null;
  const links = {
    base: '/tracker/calendar',
    scope: (await searchParams).scope?.toString() ?? 'all',
    cell: params.cell,
  };

  return (
    <div className="flex flex-col gap-4 p-2 md:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="px-2 font-semibold text-xl md:px-0">Calendar</h2>
        <ScopeNotice scope={scope} />
        <TrackerCalendar
          data={data}
          accounts={scope.accounts}
          links={links}
          selectedDay={params.day}
          today={params.today}
        />
        <MonthSummary summary={data.calendar.summary} statusEvents={data.statusEvents} />
      </div>
      {detail && (
        <DayView
          detail={detail}
          accounts={scope.accounts}
          closeHref={calendarHref(links, { month: params.monthParam })}
          saveNote={saveDailyNoteAction}
        />
      )}
    </div>
  );
}
