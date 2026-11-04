import type { SearchParams } from 'nuqs/server';
import { loadLiveVsBacktestSearchParams } from '@/modules/tracker/live-vs-backtest/search-params';
import {
  LvbAdherence,
  LvbControls,
  LvbCoverage,
  LvbHeadline,
  type LvbLinks,
  LvbTable,
  rangeVerdict,
} from '@/modules/tracker/live-vs-backtest/view';
import { getLiveVsBacktest } from '@/modules/tracker/server/analytics';
import { getPageScope } from '@/modules/tracker/server/scope';

export const metadata = { title: 'Live vs backtest · Tracker' };

/**
 * Live vs backtest (§8.3 screen 8, Joe 4 Nov 2026): by kill-zone session, per week / month / all time, with the
 * backtest counted as one pick per session or as a portfolio of both indices.
 */
export default async function LiveVsBacktestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getPageScope(searchParams);
  const params = await loadLiveVsBacktestSearchParams(searchParams);
  const report = scope ? await getLiveVsBacktest(scope, { kind: params.period, key: params.at }) : null;
  if (!report) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const links: LvbLinks = {
    scope: (await searchParams).scope?.toString() ?? 'all',
    period: report.period.kind,
    at: report.period.key,
    view: params.view,
  };
  const liveLabel = scope?.source === 'live' ? 'the selected scope' : 'all live accounts';
  const unit = report.period.kind === 'all' ? 'period' : report.period.kind;
  const verdict = rangeVerdict(report.rows[0]);
  const hasTrades = report.coverage.backtestedSessions > 0;
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Live vs backtest</h2>
      <p className="text-muted-foreground text-sm">
        Live trades from {liveLabel} against your backtests of the same days, kill-zone session by session (New York
        time). Only backtested sessions are compared. R only counts trades with a known risk.
      </p>
      <LvbControls report={report} links={links} />
      {report.backtest === 0 && (
        <p className="text-muted-foreground text-sm">No backtest trades yet. Replay some sessions in Backtest Lab.</p>
      )}
      <LvbCoverage report={report} unit={unit} />
      {!hasTrades ? (
        <p className="text-muted-foreground text-sm">
          Nothing to compare yet: no session in this {unit} was backtested.
        </p>
      ) : (
        <>
          <LvbHeadline report={report} />
          {verdict && (
            <p className="text-sm" data-testid="lvb-verdict">
              {verdict}
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {report.rows.map((row) => (
              <LvbTable key={row.symbol} row={row} view={params.view} />
            ))}
            <LvbAdherence report={report} />
          </div>
        </>
      )}
    </div>
  );
}
