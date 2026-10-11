import { NEWS_DAYS, type NewsDay, tradingDay } from '@trading/core';
import type { NewsFilters } from '@trading/news';
import type { NewsEvent } from '@trading/news/server';
import Link from 'next/link';
import { formatBeirut } from '@/lib/format';
import { cn } from '@/lib/utils';
import { newsHref } from '../links';
import { Countdown } from './countdown';
import { Folder } from './folder';

/** ForexFactory-style week (news spec §2): days, same-time groups, today and the next event highlighted. */
export function WeekView({
  days,
  next,
  now,
  filters,
  week,
}: {
  days: NewsDay<NewsEvent>[];
  next: NewsEvent | null;
  now: Date;
  filters: NewsFilters;
  week: string;
}) {
  const today = tradingDay(now, NEWS_DAYS);
  return (
    <div className="flex flex-col gap-3" data-testid="news-week">
      {days.map((day) => (
        <section
          key={day.date}
          aria-label={formatBeirut(new Date(`${day.date}T12:00:00Z`), 'EEEE d MMMM')}
          className={cn('rounded-lg border', day.date === today && 'border-primary')}
          data-testid={day.date === today ? 'news-today' : undefined}
        >
          <h3 className="flex items-center justify-between border-b px-3 py-2 font-medium text-sm">
            <span>{formatBeirut(new Date(`${day.date}T12:00:00Z`), 'EEE d MMM')}</span>
            {day.date === today && <span className="text-primary text-xs">Today</span>}
          </h3>
          {day.slots.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground text-sm">No events.</p>
          ) : (
            <ul>
              {day.slots.map((slot) => (
                <li key={slot.at.toISOString()} className="border-b last:border-0">
                  <ul>
                    {slot.events.map((e, i) => {
                      const past = e.eventAt.getTime() < now.getTime();
                      const isNext = next?.id === e.id;
                      return (
                        <li key={e.id}>
                          <Link
                            href={newsHref('/news', filters, { week, event: e.id }, true)}
                            scroll={false}
                            data-testid="news-event"
                            data-next={isNext || undefined}
                            className={cn(
                              'grid grid-cols-[3.25rem_2.75rem_1.25rem_1fr_auto] items-start gap-x-2 px-3 py-2 text-sm hover:bg-accent md:grid-cols-[4rem_3rem_1.25rem_1fr_6rem_6rem_1.5rem]',
                              past && 'text-muted-foreground',
                              isNext && 'bg-warning/10',
                            )}
                          >
                            <span className="num">
                              {i === 0 ? (e.impact === 'holiday' ? 'All day' : formatBeirut(e.eventAt, 'HH:mm')) : ''}
                            </span>
                            <span className="font-medium">{e.currency}</span>
                            <Folder impact={e.impact} className="mt-0.5 h-3.5 w-4" />
                            <span className="min-w-0">
                              <span className="block">{e.title}</span>
                              {isNext && (
                                <span className="block text-warning text-xs">
                                  Next · <Countdown to={e.eventAt.toISOString()} now={now.toISOString()} />
                                </span>
                              )}
                              {(e.forecast || e.previous) && (
                                <span className="block text-muted-foreground text-xs md:hidden">
                                  F {e.forecast ?? '—'} · P {e.previous ?? '—'}
                                </span>
                              )}
                            </span>
                            <span className="hidden num md:block">{e.forecast ?? ''}</span>
                            <span className="hidden num md:block">{e.previous ?? ''}</span>
                            <span title={e.isRestricted ? (e.restrictionLabel ?? 'Restricted') : undefined}>
                              {e.isRestricted ? '🔒' : ''}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
