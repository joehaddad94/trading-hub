import type { TradeStats } from '@trading/core';
import type { SearchParams } from 'nuqs/server';
import { formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatR } from '@/modules/tracker/calendar/format';
import { ScopeNotice } from '@/modules/tracker/components/scope-notice';
import { getNewsSplit } from '@/modules/tracker/server/news';
import { getPageScope } from '@/modules/tracker/server/scope';

/** Analytics (§8.3 screen 7). M13 adds the news vs non-news split; the rest of the screen lands in M21. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getPageScope(searchParams);
  if (!scope) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const split = await getNewsSplit(scope);
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Analytics</h2>
      <ScopeNotice scope={scope} />
      <section className="flex flex-col gap-3 rounded-lg border p-4" data-testid="news-split">
        <h3 className="font-medium">News vs other days</h3>
        {!split ? (
          <p className="text-muted-foreground text-sm">No trades in scope.</p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Red folders in the counted currencies ({split.events} events in the trades&apos; date range). Fewer events
              than expected means the news backfill hasn&apos;t run yet.
            </p>
            <SplitTable
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
                <SplitTable rows={split.byEvent.map((e) => [`${e.currency} ${e.title} · ${e.days}d`, e.stats])} />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SplitTable({ rows }: { rows: [string, TradeStats][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground text-xs">
            <th className="p-2 font-normal">Group</th>
            <th className="p-2 text-right font-normal">Trades</th>
            <th className="p-2 text-right font-normal">Net</th>
            <th className="p-2 text-right font-normal">Win rate</th>
            <th className="p-2 text-right font-normal">Expectancy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, s]) => (
            <tr key={label} className="border-b last:border-0">
              <th scope="row" className="p-2 text-left font-normal">
                {label}
              </th>
              <td className="p-2 text-right tabular-nums">{s.trades}</td>
              <td
                className={cn('p-2 text-right tabular-nums', s.net.gt(0) && 'text-profit', s.net.lt(0) && 'text-loss')}
              >
                {formatMoney(s.net)}
              </td>
              <td className="p-2 text-right tabular-nums">{formatPct(s.winRate)}</td>
              <td className="p-2 text-right tabular-nums">{formatR(s.expectancyR)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
