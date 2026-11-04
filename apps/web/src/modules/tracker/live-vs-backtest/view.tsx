import { type CompareRow, type CompareSide, gapR, rangePosition } from '@trading/core';
import type { LiveVsBacktestReport } from '@trading/tracker/server';
import type Decimal from 'decimal.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { formatMoney, formatPct, formatR } from '@/lib/format';
import { symbolWithAlias } from '@/lib/symbols';
import { cn } from '@/lib/utils';
import type { BacktestView } from './search-params';

export type LvbLinks = { scope: string; period: string; at: string; view: BacktestView };

/** Link to this page with some of its URL state changed. */
export function lvbHref(links: LvbLinks, patch: Partial<Omit<LvbLinks, 'at'>> & { at?: string | null }): Route {
  const next = { ...links, ...patch };
  const q = new URLSearchParams();
  if (next.scope !== 'all') q.set('scope', next.scope);
  q.set('period', next.period);
  if (next.at && next.period !== 'all') q.set('at', next.at);
  q.set('view', next.view);
  return `/tracker/live-vs-backtest?${q}` as Route;
}

const segment =
  'flex h-9 items-center rounded px-3 text-xs aria-[current=page]:bg-accent aria-[current=page]:font-medium';

const PERIODS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
] as const;

const VIEWS: { key: BacktestView; label: string; title: string }[] = [
  {
    key: 'onepick',
    label: 'One pick',
    title: 'Per kill zone, only the first backtest trade to trigger counts, on either index (lower bound).',
  },
  {
    key: 'portfolio',
    label: 'Portfolio',
    title: 'Every backtest trade counts, both indices whenever both triggered (upper bound).',
  },
];

/** Period kind, period stepper and backtest view toggle. All are links, so the URL holds the state. */
export function LvbControls({ report, links }: { report: LiveVsBacktestReport; links: LvbLinks }) {
  const { period } = report;
  const step = 'flex size-9 items-center justify-center rounded-md border';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="flex rounded-md border p-0.5" aria-label="Period">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={lvbHref(links, { period: p.key, at: null })}
            aria-current={period.kind === p.key ? 'page' : undefined}
            className={segment}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      {period.kind !== 'all' && (
        <div className="flex items-center gap-1">
          {period.prev ? (
            <Link href={lvbHref(links, { at: period.prev })} className={step} aria-label="Previous period">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={cn(step, 'opacity-40')} aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
          <span className="min-w-36 text-center font-medium text-sm" data-testid="lvb-period">
            {period.label}
          </span>
          {period.next ? (
            <Link href={lvbHref(links, { at: period.next })} className={step} aria-label="Next period">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={cn(step, 'opacity-40')} aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      )}
      <nav className="flex rounded-md border p-0.5 sm:ml-auto" aria-label="Backtest counts">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={lvbHref(links, { view: v.key })}
            aria-current={links.view === v.key ? 'page' : undefined}
            className={segment}
            title={v.title}
          >
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const signed = (r: Decimal | null) => cn('num', r?.gt(0) && 'text-profit', r?.lt(0) && 'text-loss');

/** Headline: live R against the backtest's range (one pick … portfolio), and index pick match. */
export function LvbHeadline({ report }: { report: LiveVsBacktestReport }) {
  const all = report.rows[0];
  const tiles = [
    {
      label: 'Live R (backtested sessions)',
      value: all?.live?.netR ?? null,
      sub: `${fmtCount(all?.live?.trades)} trades`,
    },
    {
      label: 'Backtest one pick',
      value: all?.onePick?.netR ?? null,
      sub: `${fmtCount(all?.onePick?.trades)} trades · lower bound`,
    },
    {
      label: 'Backtest portfolio',
      value: all?.portfolio?.netR ?? null,
      sub: `${fmtCount(all?.portfolio?.trades)} trades · upper bound`,
    },
  ];
  const pm = report.pickMatch;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="lvb-headline">
      {tiles.map((t) => (
        <div key={t.label} className="glass flex flex-col gap-1 rounded-xl p-3">
          <span className="text-muted-foreground text-xs">{t.label}</span>
          <span className={cn('font-semibold text-lg', signed(t.value))}>{formatR(t.value)}</span>
          <span className="text-muted-foreground text-xs">{t.sub}</span>
        </div>
      ))}
      <div className="glass flex flex-col gap-1 rounded-xl p-3" data-testid="lvb-pick-match">
        <span className="text-muted-foreground text-xs">Index pick match</span>
        <span className="num font-semibold text-lg">{pm.rate ? formatPct(pm.rate) : '—'}</span>
        <span className="text-muted-foreground text-xs">
          {pm.sessions
            ? `${pm.matched} of ${pm.sessions} shared sessions`
            : 'Needs live and backtest in the same sessions'}
        </span>
      </div>
    </div>
  );
}

/** Where live R lands against the backtest range, in one sentence. */
export function rangeVerdict(row: CompareRow | undefined): string | null {
  const p = rangePosition(row);
  if (!p) return null;
  const by = `${p.by.toFixed(2)}R`;
  if (p.position === 'below') return `Live is ${by} below even the one-pick backtest.`;
  if (p.position === 'above') return `Live beats the portfolio backtest by ${by}.`;
  return 'Live sits inside the backtest range (between one pick and portfolio).';
}

const fmtCount = (n: number | undefined) => (n === undefined ? '0' : Number.isInteger(n) ? String(n) : n.toFixed(1));

type Metric = { label: string; value: (s: CompareSide) => string; gap?: (l: CompareSide, b: CompareSide) => string };

const diffR = (a: Decimal | null, b: Decimal | null) => (a && b ? formatR(b.minus(a)) : '—');

const METRICS: Metric[] = [
  { label: 'Trades', value: (s) => fmtCount(s.trades) },
  { label: 'Sessions traded', value: (s) => fmtCount(s.sessions) },
  {
    label: 'Win rate',
    value: (s) => formatPct(s.winRate),
    gap: (l, b) =>
      l.winRate && b.winRate
        ? `${b.winRate.minus(l.winRate).gte(0) ? '+' : ''}${formatPct(b.winRate.minus(l.winRate))}`
        : '—',
  },
  { label: 'R per trade', value: (s) => formatR(s.expectancyR), gap: (l, b) => formatR(gapR(l, b)) },
  { label: 'R per session', value: (s) => formatR(s.rPerSession), gap: (l, b) => diffR(l.rPerSession, b.rPerSession) },
  { label: 'R total', value: (s) => formatR(s.netR), gap: (l, b) => diffR(l.netR, b.netR) },
  { label: 'P&L', value: (s) => formatMoney(s.net) },
];

/** Live vs the chosen backtest view, metric by metric, with the gap (backtest − live). */
export function LvbTable({ row, view }: { row: CompareRow; view: BacktestView }) {
  const bt = view === 'portfolio' ? row.portfolio : row.onePick;
  const title = row.symbol === 'all' ? 'Both indices' : symbolWithAlias(row.symbol);
  return (
    <section className="glass flex flex-col gap-2 rounded-xl p-4" data-testid="lvb-symbol" aria-label={title}>
      <h3 className="font-medium">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground text-xs">
            <th className="p-2 font-normal">Metric</th>
            <th className="p-2 text-right font-normal">Live</th>
            <th className="p-2 text-right font-normal">Backtest</th>
            <th className="p-2 text-right font-normal" title="Backtest minus live">
              Gap
            </th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => (
            <tr key={m.label} className="border-b last:border-0">
              <th scope="row" className="p-2 text-left font-normal">
                {m.label}
              </th>
              <td className="p-2 text-right num">{row.live ? m.value(row.live) : '—'}</td>
              <td className="p-2 text-right num">{bt ? m.value(bt) : '—'}</td>
              <td className="p-2 text-right text-muted-foreground num">
                {m.gap && row.live && bt ? m.gap(row.live, bt) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Rule adherence from the journal's "followed plan", and what breaking the plan cost in R. */
export function LvbAdherence({ report }: { report: LiveVsBacktestReport }) {
  const a = report.adherence;
  return (
    <section
      className="glass flex flex-col gap-2 rounded-xl p-4"
      data-testid="lvb-adherence"
      aria-label="Rule adherence"
    >
      <h3 className="font-medium">Rule adherence (live)</h3>
      {a.answered === 0 ? (
        <p className="text-muted-foreground text-sm">
          No journaled trades in this period. Answer “Followed plan” in the Journal to see it.
        </p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Followed plan</dt>
            <dd className="num font-semibold">{formatPct(a.rate)}</dd>
            <dd className="text-muted-foreground text-xs">
              {a.followed} of {a.answered} journaled
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">R / trade, followed</dt>
            <dd className={cn('font-semibold', signed(a.followedSide?.expectancyR ?? null))}>
              {formatR(a.followedSide?.expectancyR ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">R / trade, broke plan</dt>
            <dd className={cn('font-semibold', signed(a.brokeSide?.expectancyR ?? null))}>
              {formatR(a.brokeSide?.expectancyR ?? null)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/**
 * How much of the period was backtested: live sessions covered, trades left out, and a link that opens replay
 * at the first live session nobody backtested yet.
 */
export function LvbCoverage({ report, unit }: { report: LiveVsBacktestReport; unit: string }) {
  const c = report.coverage;
  const full = c.liveSessions > 0 && c.coveredLiveSessions === c.liveSessions;
  return (
    <section
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 text-sm',
        full ? 'border-border' : 'border-warning/40 bg-warning/10',
      )}
      data-testid="lvb-coverage"
      aria-label="Backtest coverage"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">
          {c.liveSessions === 0
            ? `No live trades this ${unit}`
            : `${c.coveredLiveSessions} of ${c.liveSessions} live sessions backtested`}
        </span>
        <span className="text-muted-foreground text-xs">
          {c.backtestedSessions === 0
            ? `Nothing backtested this ${unit} yet`
            : `Compares only the ${c.backtestedSessions} backtested ${c.backtestedSessions === 1 ? 'session' : 'sessions'}`}
          {c.uncoveredLiveTrades > 0 &&
            ` · ${c.uncoveredLiveTrades} live ${c.uncoveredLiveTrades === 1 ? 'trade' : 'trades'} left out`}
          {c.missedByLive > 0 &&
            ` · backtest traded ${c.missedByLive} ${c.missedByLive === 1 ? 'session' : 'sessions'} you didn't`}
        </span>
      </div>
      {c.firstUncoveredAt && (
        <Link
          href={`/backtest/chart?at=${c.firstUncoveredAt.toISOString()}` as Route}
          className="flex h-9 items-center rounded-md border bg-background px-3 font-medium text-xs sm:ml-auto"
          data-testid="lvb-backtest-gap"
        >
          Backtest this {unit}
        </Link>
      )}
    </section>
  );
}
