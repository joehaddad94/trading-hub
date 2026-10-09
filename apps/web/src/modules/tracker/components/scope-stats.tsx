import { type TradeStats, tradeStats } from '@trading/core';
import type { ResolvedScope, ScopedTrade } from '@trading/tracker/server';
import type Decimal from 'decimal.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatPct } from '@/lib/format';

const r = (d: Decimal | null) => (d ? `${d.toFixed(2)}R` : '—');

/** Headline numbers for a scope, all from @trading/core metrics (rule 8). */
export function ScopeStats({ scope, trades }: { scope: ResolvedScope; trades: ScopedTrade[] }) {
  const s: TradeStats = tradeStats(trades);
  const exact = trades.filter((t) => t.riskSource && t.riskSource !== 'estimated').length;
  const items: [string, string][] = [
    ['Net P/L', formatMoney(s.net)],
    ['Trades', `${s.trades} (${s.wins} W · ${s.losses} L · ${s.scratches} scratch)`],
    ['Win rate', formatPct(s.winRate)],
    ['Breakeven win rate', formatPct(s.breakevenWinRate)],
    ['Profit factor', s.profitFactor ? s.profitFactor.toFixed(2) : '—'],
    ['Avg win / loss', `${s.avgWin ? formatMoney(s.avgWin) : '—'} / ${s.avgLoss ? formatMoney(s.avgLoss) : '—'}`],
    ['Expectancy', r(s.expectancyR)],
    ['Exact risk', trades.length ? `${exact} of ${trades.length} trades` : '—'],
  ];
  return (
    <Card data-testid="scope-stats" data-accounts={scope.accountIds.length}>
      <CardHeader>
        <CardTitle className="text-base">In this scope</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
          {items.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
