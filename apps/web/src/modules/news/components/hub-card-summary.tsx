import type { NewsHubSummary } from '@trading/news/server';
import { formatBeirut } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Countdown } from './countdown';
import { Folder } from './folder';

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** The hub's News card (news spec §3): today's red folders, countdown, restriction warning, week strip. */
export function NewsHubCardSummary({ summary, now }: { summary: NewsHubSummary | null; now: Date }) {
  if (!summary?.lastSync) return <span>No data yet.</span>;
  const label = summary.currencies.join('/');
  const max = Math.max(1, ...summary.week.map((d) => d.red));
  return (
    <div className="flex flex-col gap-3" data-testid="news-hub-summary">
      {summary.activeRestrictions.length > 0 && (
        <p className="rounded-md bg-warning/15 px-2 py-1 text-warning" role="alert">
          ⚠️ Restriction window: {summary.activeRestrictions.map((e) => `${e.currency} ${e.title}`).join(', ')}
        </p>
      )}
      <div>
        <p className="mb-1">Today</p>
        {summary.today.length === 0 ? (
          <p className="text-foreground">No high-impact {label} news today.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-foreground">
            {summary.today.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="num">{formatBeirut(e.eventAt, 'HH:mm')}</span>
                <Folder impact={e.impact} />
                <span className="truncate">
                  {e.currency} {e.title}
                </span>
                {e.isRestricted && <span title="Restricted">🔒</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {summary.next && (
        <p>
          Next: <span className="text-foreground">{summary.next.title}</span>{' '}
          <Countdown to={summary.next.eventAt.toISOString()} now={now.toISOString()} />
        </p>
      )}
      <div className="grid grid-cols-5 gap-1 text-center text-xs" title="Red folders this week">
        {summary.week.map((d, i) => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <div className="flex h-8 w-full items-end justify-center">
              <div
                className={cn('w-4 rounded-sm', d.red ? 'bg-loss' : 'bg-muted')}
                style={{ height: `${Math.max(12, (d.red / max) * 100)}%` }}
                title={`${d.red} red folders`}
              />
            </div>
            <span>
              {DAY[i]} {d.red > 0 ? d.red : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
