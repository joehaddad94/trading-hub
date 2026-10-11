import {
  currentNewsWeek,
  groupWeek,
  mondayOf,
  NEWS_DAYS,
  nextEvent,
  parseWeek,
  shiftWeek,
  tradingDay,
} from '@trading/core';
import { DEFAULT_FILTERS, parseNewsFilters } from '@trading/news';
import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { z } from 'zod';
import { formatBeirut } from '@/lib/format';
import { EventPanel } from '@/modules/news/components/event-panel';
import { NewsFilterBar } from '@/modules/news/components/news-filters';
import { WeekView } from '@/modules/news/components/week-view';
import { newsHref } from '@/modules/news/links';
import { loadNewsSearchParams } from '@/modules/news/search-params';
import { getEventDetail, getNewsSettingsOrDefault, getWeek } from '@/modules/news/server/news';

/** News week view (news spec §2). */
export default async function NewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await loadNewsSearchParams(searchParams);
  const now = new Date();
  const week = parseWeek(params.week, now);
  const settings = await getNewsSettingsOrDefault();
  const filters = parseNewsFilters(params, { ...DEFAULT_FILTERS, currencies: settings.currencies });
  const data = await getWeek(week, filters);
  if (!data) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const eventId = params.event && z.uuid().safeParse(params.event).success ? params.event : null;
  const detail = eventId ? await getEventDetail(eventId, now) : null;
  const days = groupWeek(week, data.events);
  const next = nextEvent(data.events, now);
  const thisWeek = currentNewsWeek(now);
  const weekend = thisWeek !== mondayOf(tradingDay(now, NEWS_DAYS));
  const nav = (label: string, target: string, aria?: string) => (
    <Link
      href={newsHref('/news', filters, { week: target === thisWeek ? null : target }, true)}
      aria-label={aria}
      className="flex h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm hover:bg-accent md:h-9"
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-xl">Week of {formatBeirut(new Date(`${week}T12:00:00Z`), 'd MMM yyyy')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {nav('‹', shiftWeek(week, -1), 'Previous week')}
          {nav(weekend ? 'Coming week' : 'This week', thisWeek)}
          {nav('Next week', shiftWeek(thisWeek, 1))}
          {nav('›', shiftWeek(week, 1), 'Next week ›')}
          <form method="get" className="flex items-center gap-1" aria-label="Go to date">
            {(['impact', 'currency', 'restricted'] as const).map((k) =>
              params[k] ? <input key={k} type="hidden" name={k} value={params[k] ?? ''} /> : null,
            )}
            <input
              type="date"
              name="week"
              aria-label="Week containing"
              defaultValue={week}
              className="h-11 rounded-md border bg-background px-2 text-sm md:h-9"
            />
            <button type="submit" className="h-11 rounded-md border px-3 text-sm hover:bg-accent md:h-9">
              Go
            </button>
          </form>
        </div>
      </div>
      <NewsFilterBar path="/news" filters={filters} keep={{ week: week === thisWeek ? null : week }} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <WeekView days={days} next={next} now={now} filters={filters} week={week} />
        {detail && (
          // Phone: a bottom sheet over the list; desktop: a sticky side panel.
          <div className="fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto border-t bg-background p-2 shadow-lg lg:sticky lg:top-4 lg:z-auto lg:max-h-none lg:self-start lg:border-0 lg:p-0 lg:shadow-none">
            <EventPanel detail={detail} filters={filters} week={week} now={now} />
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-xs" data-testid="news-last-sync">
        Calendar last synced: {data.lastSync ? formatBeirut(data.lastSync, 'd MMM yyyy, HH:mm') : 'never'}. Times are
        Beirut. Same-day changes appear after the next daily sync.
      </p>
    </div>
  );
}
