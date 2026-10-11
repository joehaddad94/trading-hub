import { type Group, serializeScope } from '@trading/core';
import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { NetBars } from '@/modules/tracker/components/net-bars';
import { RHistogram } from '@/modules/tracker/components/r-histogram';
import { ScopeNotice } from '@/modules/tracker/components/scope-notice';
import { StatsTable } from '@/modules/tracker/components/stats-table';
import { getAnalytics } from '@/modules/tracker/server/analytics';
import { getNewsSplit } from '@/modules/tracker/server/news';
import { getPageScope } from '@/modules/tracker/server/scope';

export const metadata = { title: 'Analytics · Tracker' };

const rows = (groups: Group[]) => groups.map((g) => [g.label, g.stats] as [string, Group['stats']]);
const bars = (groups: Group[]) =>
  groups.map((g) => ({ label: g.label, net: g.stats.net.toNumber(), trades: g.stats.trades }));

/** Analytics (§8.3 screen 7): R distribution, streaks, breakdowns, hold time and the news split. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getPageScope(searchParams);
  if (!scope) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const [data, split] = await Promise.all([getAnalytics(scope), getNewsSplit(scope)]);
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-xl">Analytics</h2>
        <Link
          href={`/tracker/live-vs-backtest?scope=${serializeScope(scope.scope)}`}
          className="text-primary text-sm hover:underline"
        >
          Compare with backtests
        </Link>
      </div>
      <ScopeNotice scope={scope} />
      {!data || data.trades === 0 ? (
        <p className="text-muted-foreground text-sm">No closed trades in scope.</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="flex flex-col gap-2 rounded-lg border p-4" aria-label="R distribution">
              <h3 className="font-medium">R distribution</h3>
              <RHistogram bins={data.r.bins.map(({ label, count, from }) => ({ label, count, from }))} />
              {data.r.unknown > 0 && (
                <p className="text-muted-foreground text-xs">
                  {data.r.unknown} {data.r.unknown === 1 ? 'trade has' : 'trades have'} no known risk, so no R.
                </p>
              )}
            </section>
            <section className="flex flex-col gap-3 rounded-lg border p-4" data-testid="streaks">
              <h3 className="font-medium">Streaks</h3>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="Longest win run" value={String(data.streaks.longestWin)} />
                <Stat label="Longest loss run" value={String(data.streaks.longestLoss)} />
                <Stat label="Current run" value={runLabel(data.streaks.current)} />
              </dl>
              <h3 className="mt-2 font-medium">Hold time</h3>
              <NetBars bars={bars(data.holdTime)} testId="hold-bars" />
              <StatsTable rows={rows(data.holdTime)} label="Held" />
            </section>
          </div>
          <Breakdown title="By symbol" testId="by-symbol" groups={data.breakdowns.symbol} label="Symbol" />
          <Breakdown
            title="By session (New York kill zones, by open time)"
            testId="by-session"
            groups={data.breakdowns.session}
            label="Session"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown
              title="By weekday (Beirut)"
              testId="by-weekday"
              groups={data.breakdowns.weekday}
              label="Day"
              chart
            />
            <Breakdown
              title="By hour opened (Beirut)"
              testId="by-hour"
              groups={data.breakdowns.hour}
              label="Hour"
              chart
            />
          </div>
        </>
      )}
      <section className="flex flex-col gap-3 rounded-lg border p-4" data-testid="news-split">
        <h3 className="font-medium">News vs other days</h3>
        {!split ? (
          <p className="text-muted-foreground text-sm">No trades in scope.</p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Red folders in the counted currencies ({split.events} {split.events === 1 ? 'event' : 'events'} in the
              trades&apos; date range). Fewer events than expected means the news backfill hasn&apos;t run yet.
            </p>
            <StatsTable
              rows={[
                ['Red-folder days', split.byDay.news],
                ['Other days', split.byDay.other],
                ['Opened ±30 min of a red folder', split.near.news],
                ['Not near a red folder', split.near.other],
              ]}
            />
            {split.byEvent.length > 0 && (
              <>
                <h4 className="font-medium text-sm">By event (days with that red folder)</h4>
                <StatsTable rows={split.byEvent.map((e) => [`${e.currency} ${e.title} · ${e.days}d`, e.stats])} />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function runLabel({ kind, length }: { kind: 'win' | 'loss' | null; length: number }) {
  if (!kind) return '—';
  if (kind === 'win') return `${length} ${length === 1 ? 'win' : 'wins'}`;
  return `${length} ${length === 1 ? 'loss' : 'losses'}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium text-lg tabular-nums">{value}</dd>
    </div>
  );
}

function Breakdown({
  title,
  testId,
  groups,
  label,
  chart = false,
}: {
  title: string;
  testId: string;
  groups: Group[];
  label: string;
  /** Also draw net P/L per group as bars. */
  chart?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4" data-testid={testId}>
      <h3 className="font-medium">{title}</h3>
      {chart && <NetBars bars={bars(groups)} testId={`${testId}-bars`} />}
      <StatsTable rows={rows(groups)} label={label} />
    </section>
  );
}
