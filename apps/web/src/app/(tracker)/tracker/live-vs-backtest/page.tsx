import type { TradeStats } from '@trading/core';
import type { SearchParams } from 'nuqs/server';
import { formatMoney, formatPct, formatR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getLiveVsBacktest } from '@/modules/tracker/server/analytics';
import { getPageScope } from '@/modules/tracker/server/scope';

export const metadata = { title: 'Live vs backtest · Tracker' };

type Metric = { label: string; value: (s: TradeStats) => string };

const METRICS: Metric[] = [
  { label: 'Trades', value: (s) => String(s.trades) },
  { label: 'Win rate', value: (s) => formatPct(s.winRate) },
  { label: 'Avg win', value: (s) => formatR(s.avgWinR) },
  { label: 'Avg loss', value: (s) => formatR(s.avgLossR) },
  { label: 'Expectancy', value: (s) => formatR(s.expectancyR) },
  { label: 'Profit factor', value: (s) => (s.profitFactor ? s.profitFactor.toFixed(2) : '—') },
  { label: 'Net', value: (s) => formatMoney(s.net) },
];

/**
 * Live vs backtest (§8.3 screen 8): the same metrics per symbol. A big expectancy gap means live execution
 * differs from the tested plan.
 */
export default async function LiveVsBacktestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getPageScope(searchParams);
  const report = scope ? await getLiveVsBacktest(scope) : null;
  if (!report) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const liveLabel = scope?.source === 'live' ? 'the selected scope' : 'all live accounts';
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Live vs backtest</h2>
      <p className="text-muted-foreground text-sm">
        {report.live} live trades ({liveLabel}) against {report.backtest} backtest trades (every session). R metrics
        only count trades with a known risk.
      </p>
      {report.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No closed trades yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {report.rows.map((row) => (
            <section
              key={row.symbol}
              className="flex flex-col gap-2 rounded-lg border p-4"
              data-testid="lvb-symbol"
              aria-label={row.symbol}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{row.symbol}</h3>
                {row.expectancyGapR && (
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      row.expectancyGapR.abs().gte(0.25) ? 'text-loss' : 'text-muted-foreground',
                    )}
                    data-testid="expectancy-gap"
                  >
                    Backtest {row.expectancyGapR.gte(0) ? 'beats' : 'trails'} live by{' '}
                    {formatR(row.expectancyGapR.abs())}
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs">
                    <th className="p-2 font-normal">Metric</th>
                    <th className="p-2 text-right font-normal">Live</th>
                    <th className="p-2 text-right font-normal">Backtest</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((m) => (
                    <tr key={m.label} className="border-b last:border-0">
                      <th scope="row" className="p-2 text-left font-normal">
                        {m.label}
                      </th>
                      <td className="p-2 text-right tabular-nums">{row.live ? m.value(row.live) : '—'}</td>
                      <td className="p-2 text-right tabular-nums">{row.backtest ? m.value(row.backtest) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
