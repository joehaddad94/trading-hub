import type { NewsFilters } from '@trading/news';
import type { EventDetail } from '@trading/news/server';
import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import { formatBeirut, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { newsHref } from '../links';
import { Folder } from './folder';

/** Event panel (news spec §2): details, past occurrences with forecast/previous, trades within ±60 min. */
export function EventPanel({
  detail,
  filters,
  week,
  now,
}: {
  detail: EventDetail;
  filters: NewsFilters;
  week: string;
  now: Date;
}) {
  const e = detail.event;
  return (
    <aside
      aria-label="Event details"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm"
      data-testid="event-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Folder impact={e.impact} /> {e.currency} · {e.title}
          </h3>
          <p className="text-muted-foreground">
            {formatBeirut(e.eventAt, 'EEE d MMM yyyy, HH:mm')} Beirut
            {e.isRestricted ? ` · 🔒 ${e.restrictionLabel ?? 'Restricted'}` : ''}
          </p>
        </div>
        <Link
          href={newsHref('/news', filters, { week }, true)}
          scroll={false}
          className="flex h-11 items-center px-2 text-muted-foreground md:h-8"
          aria-label="Close event details"
        >
          ✕
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <div>
          <dt className="text-muted-foreground text-xs">Forecast</dt>
          <dd>{e.forecast ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Previous</dt>
          <dd>{e.previous ?? '—'}</dd>
        </div>
      </dl>
      <div>
        <h4 className="mb-1 font-medium">Occurrences</h4>
        <ul className="flex flex-col gap-2" data-testid="event-history">
          {detail.history.map((h) => (
            <li key={h.id} className={cn('rounded-md border p-2', h.id === e.id && 'border-primary')}>
              <p className="flex justify-between gap-2">
                <span>{formatBeirut(h.eventAt, 'd MMM yyyy HH:mm')}</span>
                <span className="text-muted-foreground text-xs">
                  F {h.forecast ?? '—'} · P {h.previous ?? '—'}
                </span>
              </p>
              {h.eventAt.getTime() <= now.getTime() &&
                (h.trades.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No trades within 60 minutes.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                    {h.trades.map((t) => {
                      const net = new Decimal(t.netProfit);
                      const mins = Math.round((t.openedAt.getTime() - h.eventAt.getTime()) / 60_000);
                      return (
                        <li key={t.id}>
                          <Link
                            href={`/tracker/trades/${t.id}` as Route}
                            className="flex justify-between gap-2 hover:underline"
                          >
                            <span>
                              {t.login} · {t.symbol} {t.side} · opened {Math.abs(mins)} min{' '}
                              {mins < 0 ? 'before' : 'after'}
                            </span>
                            <span className={cn('num', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}>
                              {formatMoney(t.netProfit)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ))}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
