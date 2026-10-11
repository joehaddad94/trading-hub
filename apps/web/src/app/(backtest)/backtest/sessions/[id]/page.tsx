import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { EquityCurve } from '@/components/equity-curve';
import { formatBeirut, formatMoney, formatPct, formatR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getSessionDetail } from '@/modules/backtest/server/sessions';
import { SessionControls } from '@/modules/backtest/sessions/session-controls';
import { SessionForm } from '@/modules/backtest/sessions/session-form';
import { deleteSessionAction, sessionStatusAction, updateSessionAction } from '../../actions';

export const metadata = { title: 'Session · Backtest Lab' };

const EXIT_LABELS: Record<string, string> = { tp: 'Target', sl: 'Stop', breakeven: 'Breakeven', manual: 'Manual' };

/** Backtester spec §7: a session's stats, equity curve and trades, with resume / complete / delete. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getSessionDetail(id);
  if (!data) notFound();
  const { session, stats, drawdown, trades } = data;
  const resume = new URLSearchParams({ session: session.id });
  const lastSymbol = trades.at(-1)?.symbol;
  if (lastSymbol) resume.set('i', lastSymbol);
  if (session.cursor) resume.set('at', new Date(session.cursor).toISOString());
  const tiles: [string, string][] = [
    ['Net', formatMoney(stats.net)],
    ['Trades', String(stats.trades)],
    ['Win rate', formatPct(stats.winRate)],
    ['Expectancy', formatR(stats.expectancyR)],
    ['Net R', formatR(stats.netR)],
    ['Profit factor', stats.profitFactor ? stats.profitFactor.toFixed(2) : '—'],
    ['Max drawdown', drawdown ? formatMoney(drawdown.amount.negated()) : '—'],
    ['Balance', formatMoney(stats.net.plus(session.startingBalance))],
  ];
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <Link href="/backtest" className="text-muted-foreground text-xs hover:underline">
              ← Sessions
            </Link>
            <h2 className="truncate font-semibold text-xl">{session.name}</h2>
            <p className="text-muted-foreground text-xs">
              {session.status === 'completed' ? 'Completed' : 'In progress'}
              {session.cursor && ` · replay at ${formatBeirut(new Date(session.cursor))}`} · risk {session.riskPct}% of{' '}
              {formatMoney(session.startingBalance)}
            </p>
          </div>
          <Link
            href={`/backtest/chart?${resume.toString()}`}
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm md:h-9"
          >
            {session.status === 'completed' ? 'Open on chart' : 'Resume'}
          </Link>
        </div>
        {data.ambiguous > 0 && (
          <p role="note" className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">
            {data.ambiguous} {data.ambiguous === 1 ? 'trade' : 'trades'} hit stop and target in the same 1-minute bar;
            the stop was assumed first.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="session-stats">
          {tiles.map(([label, value]) => (
            <div key={label} className="glass rounded-xl p-3">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-semibold text-lg num">{value}</dd>
            </div>
          ))}
        </dl>
        <section className="glass rounded-xl p-4">
          <h3 className="mb-2 font-medium">Equity</h3>
          <EquityCurve
            points={data.curve.map((p) => ({ i: p.i, t: p.at, equity: p.equity, pnl: p.pnl, account: '' }))}
            boundaries={[]}
          />
        </section>
        <section className="flex flex-col gap-2 glass rounded-xl p-4">
          <h3 className="font-medium">Trades</h3>
          {trades.length === 0 ? (
            <p className="text-muted-foreground text-sm">No closed trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm" aria-label="Session trades">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs">
                    <th className="p-2 font-normal">Closed</th>
                    <th className="p-2 font-normal">Trade</th>
                    <th className="p-2 font-normal">Exit</th>
                    <th className="p-2 text-right font-normal">Net</th>
                    <th className="p-2 text-right font-normal">R</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trades].reverse().map((t) => (
                    <tr key={t.id} className="border-b last:border-0" data-testid="session-trade">
                      <td className="p-2 num">{formatBeirut(t.closedAt, 'd MMM, HH:mm')}</td>
                      <td className="p-2">
                        {t.symbol} {t.side === 'buy' ? 'long' : 'short'} {t.lots}
                      </td>
                      <td className="p-2">
                        {t.exitReason ? EXIT_LABELS[t.exitReason] : '—'}
                        {t.ambiguous && <span className="ml-1 text-warning text-xs">(same bar)</span>}
                      </td>
                      <td
                        className={cn('p-2 text-right num', t.netProfit.startsWith('-') ? 'text-loss' : 'text-profit')}
                      >
                        {formatMoney(t.netProfit)}
                      </td>
                      <td className="p-2 text-right num">{formatR(t.r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 font-medium">Settings</h3>
          <SessionForm
            action={updateSessionAction}
            submit="Save"
            label="Session settings"
            session={session}
            tags={data.tags}
            instruments={data.instruments}
            idPrefix="edit"
          />
        </section>
        <SessionControls session={session} statusAction={sessionStatusAction} deleteAction={deleteSessionAction} />
      </div>
    </div>
  );
}
