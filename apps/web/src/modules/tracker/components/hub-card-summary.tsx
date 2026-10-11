import type { TrackerHubSummary } from '@trading/tracker/server';
import Decimal from 'decimal.js';
import { ChartCandlestick, NotebookPen } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { CountUpMoney } from '@/components/count-up';
import { formatBeirut, formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { HubTile } from '@/shell/hub-tile';
import { accountLabel } from '../scope-label';
import { Sparkline } from './sparkline';

/** Room left before the active account's max-loss floor (decimal strings). */
export type HubMaxLoss = { room: string; limit: string };

const tone = (v: Decimal) => cn(v.gt(0) && 'text-profit', v.lt(0) && 'text-loss');
const signed = (v: Decimal) => `${v.gt(0) ? '+' : ''}${formatMoney(v)}`;

/** The hub's hero (design spec): today's P&L first, then the week, the loss room and this month's curve. */
export function TrackerHubHero({
  summary,
  maxLoss,
}: {
  summary: TrackerHubSummary | null;
  maxLoss: HubMaxLoss | null;
}) {
  if (!summary?.hasData) {
    return (
      <section className="glass rise rounded-2xl p-6">
        <p className="text-muted-foreground">No trades yet. They appear here after the first sync file arrives.</p>
      </section>
    );
  }
  const today = new Decimal(summary.today.net);
  const week = new Decimal(summary.week.net);
  return (
    <section
      aria-label="Today"
      className={cn(
        'glass rise grid gap-6 rounded-2xl p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:p-7',
        today.gt(0) && 'green-day',
      )}
      data-testid="hub-hero"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
          <ChartCandlestick className="size-4 text-primary" aria-hidden />
          Today · {summary.today.trades} {summary.today.trades === 1 ? 'trade' : 'trades'}
        </p>
        <p className={cn('num font-semibold text-5xl tracking-tight md:text-6xl', tone(today))} data-testid="hub-today">
          <CountUpMoney value={summary.today.net} signed />
        </p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">This week</dt>
            <dd className={cn('num', tone(week))}>{signed(week)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Win rate</dt>
            <dd className="num">{formatPct(summary.week.winRate ? new Decimal(summary.week.winRate) : null)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Trades</dt>
            <dd className="num">{summary.week.trades}</dd>
          </div>
        </dl>
        {maxLoss && <MaxLossRoom {...maxLoss} />}
      </div>
      <div className="flex min-w-0 flex-col justify-end gap-2">
        <p className="flex justify-between text-muted-foreground text-xs">
          <span>{summary.monthLabel}</span>
          <span className={cn('num', tone(new Decimal(summary.monthNet)))}>
            {signed(new Decimal(summary.monthNet))}
          </span>
        </p>
        <Sparkline
          values={summary.monthCurve.slice(1)}
          start="0"
          area={{ gradientId: 'hub-month' }}
          className="h-32 w-full md:h-40"
        />
      </div>
    </section>
  );
}

function MaxLossRoom({ room, limit }: HubMaxLoss) {
  const left = Decimal.max(0, Decimal.min(1, new Decimal(room).div(limit)));
  const pct = left.times(100).toFixed(0);
  const bar = left.lte(0.2) ? 'bg-loss' : left.lte(0.5) ? 'bg-warning' : 'bg-primary';
  return (
    <div data-testid="hub-max-loss" className="flex flex-col gap-1.5 text-sm">
      <p className="flex justify-between gap-2">
        <span className="text-muted-foreground">Room to max loss</span>
        <span className="num">
          {formatMoney(room)} <span className="text-muted-foreground">of {formatMoney(limit)}</span>
        </span>
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <span className="sr-only">{pct}% of the max-loss limit left</span>
        <div className={cn('h-full rounded-full transition-[width] duration-700', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Tracker tile: the month and the active account. */
export function TrackerHubTile({ summary }: { summary: TrackerHubSummary | null }) {
  const [first, ...rest] = summary?.activeAccounts ?? [];
  const net = new Decimal(summary?.monthNet ?? 0);
  return (
    <HubTile
      title="Tracker"
      icon={<ChartCandlestick className="size-4 text-primary" aria-hidden />}
      href="/tracker"
      linkLabel="Open Tracker"
      index={1}
    >
      {!summary?.hasData ? (
        <p className="text-muted-foreground">No data yet.</p>
      ) : (
        <dl className="flex flex-col gap-2" data-testid="tracker-hub-summary">
          <div>
            <dt className="text-muted-foreground">{summary.monthLabel}</dt>
            <dd className={cn('num font-semibold text-2xl', tone(net))}>{signed(net)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Green days</dt>
            <dd className="num">
              {summary.greenDays} / {summary.tradingDays}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Active account</dt>
            <dd className="num">
              {first
                ? `${accountLabel(first)} · ${first.balance ? formatMoney(first.balance) : 'no balance yet'}`
                : 'None'}
              {rest.length > 0 && <span className="text-muted-foreground"> +{rest.length} more</span>}
            </dd>
          </div>
        </dl>
      )}
    </HubTile>
  );
}

/** Journal tile: how many trades still need a journal entry, straight into the Quick journal queue. */
export function JournalHubTile({ summary }: { summary: TrackerHubSummary | null }) {
  const count = summary?.awaitingJournal ?? 0;
  return (
    <HubTile
      title="Journal"
      icon={<NotebookPen className="size-4 text-primary" aria-hidden />}
      href={count > 0 ? '/tracker/journal?view=quick' : '/tracker/journal'}
      linkLabel={count > 0 ? 'Journal now' : 'Open Journal'}
      index={2}
    >
      {count > 0 ? (
        <Link href="/tracker/journal?view=quick" className="flex flex-col" data-testid="hub-quick-journal">
          <span className="num font-semibold text-4xl text-warning">{count}</span>
          <span className="text-muted-foreground">{count === 1 ? 'trade' : 'trades'} to journal</span>
        </Link>
      ) : (
        <p className="text-muted-foreground">All trades journaled.</p>
      )}
    </HubTile>
  );
}

/** The latest trades, newest first, each opening its trade page. */
export function RecentTradesCard({ summary }: { summary: TrackerHubSummary | null }) {
  if (!summary?.recent.length) return null;
  return (
    <section
      aria-label="Recent trades"
      className="glass rise overflow-hidden rounded-2xl"
      style={{ '--i': 5 } as React.CSSProperties}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Recent trades</h2>
        <Link href="/tracker/trades" className="text-primary text-sm">
          All trades
        </Link>
      </div>
      <ul>
        {summary.recent.map((t) => {
          const net = new Decimal(t.netProfit);
          return (
            <li key={t.id} className="border-t">
              <Link
                href={`/tracker/trades/${t.id}` as Route}
                className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-2.5 hover:bg-white/5 md:grid-cols-[8rem_5rem_minmax(0,1fr)_auto]"
              >
                <span className="font-medium">{t.symbol}</span>
                <span className={cn('num text-right font-medium md:order-last', tone(net))}>{signed(net)}</span>
                <span className="text-muted-foreground text-sm capitalize">{t.side}</span>
                <span className="text-right text-muted-foreground text-sm tabular-nums md:text-left">
                  {t.login} · {formatBeirut(t.closedAt, 'EEE d MMM, HH:mm')}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
