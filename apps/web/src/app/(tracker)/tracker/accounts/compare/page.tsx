import { type ProfileKey, SESSION_LABELS, type SessionName, type TradingProfile } from '@trading/core';
import { formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatHold, formatR } from '@/modules/tracker/calendar/format';
import { AccountsTabs } from '@/modules/tracker/components/accounts-tabs';
import { getPhaseComparison } from '@/modules/tracker/server/accounts';

type RowKey = ProfileKey | 'trades' | 'sessions';

const sessionMix = (p: TradingProfile) =>
  (Object.entries(p.sessionMix) as [SessionName, TradingProfile['sessionMix'][SessionName]][])
    .filter(([, share]) => share.gt(0))
    .map(([s, share]) => `${SESSION_LABELS[s]} ${share.times(100).toFixed(0)}%`)
    .join(' · ') || '—';

const ROWS: { key: RowKey; label: string; show: (p: TradingProfile) => string }[] = [
  { key: 'trades', label: 'Trades', show: (p) => String(p.trades) },
  { key: 'winRate', label: 'Win rate', show: (p) => formatPct(p.winRate) },
  { key: 'avgWinR', label: 'Avg win', show: (p) => formatR(p.avgWinR) },
  { key: 'avgLossR', label: 'Avg loss', show: (p) => formatR(p.avgLossR) },
  { key: 'expectancyR', label: 'Expectancy', show: (p) => formatR(p.expectancyR) },
  { key: 'tradesPerDay', label: 'Trades / day', show: (p) => p.tradesPerDay?.toFixed(1) ?? '—' },
  { key: 'avgHoldMs', label: 'Avg hold', show: (p) => formatHold(p.avgHoldMs) },
  { key: 'avgLots', label: 'Avg lots', show: (p) => p.avgLots?.toFixed(2) ?? '—' },
  { key: 'sessions', label: 'Session mix', show: sessionMix },
];

export const metadata = { title: 'Demo vs funded · Tracker' };

/** Demo vs Funded (§8.3 screen 4): same metrics side by side per phase; biggest deltas highlighted. */
export default async function ComparePage() {
  const c = await getPhaseComparison();
  const top = new Set<RowKey>(c?.deltas.slice(0, 3).map((d) => d.key));
  const columns = c
    ? [
        ...c.groups.map((g) => ({ label: g.label, profile: g.profile })),
        { label: 'All demo', profile: c.demo },
        { label: 'All funded', profile: c.funded },
      ]
    : [];
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Accounts</h2>
      <AccountsTabs current="compare" />
      {!c ? (
        <p className="text-muted-foreground text-sm">Database not configured.</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Highlighted rows differ most between demo and funded. R uses estimated risk until trades are journaled.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[36rem] text-sm" data-testid="compare-table">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 font-medium">Metric</th>
                  {columns.map((col) => (
                    <th key={col.label} className="p-2 font-medium">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className={cn('border-b last:border-0', top.has(row.key) && 'bg-amber-500/10')}
                    data-highlight={top.has(row.key) || undefined}
                  >
                    <th scope="row" className="p-2 text-left font-normal text-muted-foreground">
                      {row.label}
                    </th>
                    {columns.map((col) => (
                      <td key={col.label} className="p-2 tabular-nums">
                        {row.show(col.profile)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
