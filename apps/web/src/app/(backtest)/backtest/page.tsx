import Link from 'next/link';
import { formatBeirut, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CandleCoverage } from '@/modules/backtest/components/candle-banner';
import { getSessionsPage } from '@/modules/backtest/server/sessions';
import { SessionForm } from '@/modules/backtest/sessions/session-form';
import { createSessionAction } from './actions';

export const metadata = { title: 'Sessions · Backtest Lab' };

/** Backtester spec §7: sessions list, new session, candle coverage. */
export default async function SessionsPage() {
  const data = await getSessionsPage();
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-xl">Sessions</h2>
          <Link
            href="/backtest/chart"
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm md:h-9"
          >
            Open chart
          </Link>
        </div>
        {!data ? (
          <p className="text-muted-foreground text-sm">Database not configured.</p>
        ) : (
          <>
            {data.sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sessions yet. Create one below or open the chart.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border" aria-label="Backtest sessions">
                {data.sessions.map((s) => (
                  <li key={s.id} data-testid="session-row">
                    <Link
                      href={`/backtest/sessions/${s.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-muted/50"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {s.instruments.join(', ') || 'No trades yet'} · {s.trades}{' '}
                          {s.trades === 1 ? 'trade' : 'trades'}
                          {s.openOrders > 0 && ` · ${s.openOrders} open`}
                          {s.cursor && ` · at ${formatBeirut(new Date(s.cursor))}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            s.net.startsWith('-') ? 'text-loss' : s.net !== '0.00' && 'text-profit',
                          )}
                        >
                          {formatMoney(s.net)}
                        </span>
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-xs',
                            s.status === 'completed' ? 'text-muted-foreground' : 'border-primary text-primary',
                          )}
                        >
                          {s.status === 'completed' ? 'Completed' : 'In progress'}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 font-medium">New session</h3>
              <SessionForm
                action={createSessionAction}
                submit="Create and open chart"
                label="New session"
                tags={data.tags}
                instruments={data.instruments}
                idPrefix="new"
              />
            </section>
          </>
        )}
        <CandleCoverage />
      </div>
    </div>
  );
}
