import type { OverviewData, ResolvedScope } from '@trading/tracker/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatR } from '../calendar/format';

/** Overview headline numbers (§8.3 screen 1). Every number comes from @trading/core (rule 8). */
export function OverviewStats({ data, scope }: { data: OverviewData; scope: ResolvedScope }) {
  const s = data.stats;
  const npr = data.netPropResult;
  const items: [string, string, (string | undefined)?][] = [
    ['Net P/L', formatMoney(s.net), s.net.gt(0) ? 'text-profit' : s.net.lt(0) ? 'text-loss' : undefined],
    ['Trades', `${s.trades} (${s.wins} W · ${s.losses} L · ${s.scratches} scratch)`],
    ['Win rate vs breakeven', `${formatPct(s.winRate)} vs ${formatPct(s.breakevenWinRate)}`],
    ['Expectancy', formatR(s.expectancyR)],
    ['Profit factor', s.profitFactor ? s.profitFactor.toFixed(2) : '—'],
    ['Max drawdown', data.maxDrawdown ? formatMoney(data.maxDrawdown.amount.negated()) : '—'],
    ['Net prop result', formatMoney(npr.net), npr.net.gt(0) ? 'text-profit' : npr.net.lt(0) ? 'text-loss' : undefined],
    ['Payouts / fees', `${formatMoney(npr.payouts)} / ${formatMoney(npr.fees.negated())}`],
  ];
  return (
    <Card data-testid="scope-stats" data-accounts={scope.accountIds.length}>
      <CardHeader>
        <CardTitle className="text-base">Headline</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
          {items.map(([label, value, tone]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={cn('font-medium tabular-nums', tone)}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-muted-foreground text-xs">
          Net prop result counts every account&apos;s payouts and fees, whatever the scope. R uses estimated risk until
          trades are journaled.
        </p>
      </CardContent>
    </Card>
  );
}
