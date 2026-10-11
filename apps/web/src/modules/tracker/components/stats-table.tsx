import type { TradeStats } from '@trading/core';
import { formatMoney, formatPct, formatR } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One row per group: trades, net, win rate, expectancy (all from @trading/core's tradeStats). */
export function StatsTable({ rows, label = 'Group' }: { rows: [string, TradeStats][]; label?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground text-xs">
            <th className="p-2 font-normal">{label}</th>
            <th className="p-2 text-right font-normal">Trades</th>
            <th className="p-2 text-right font-normal">Net</th>
            <th className="p-2 text-right font-normal">Win rate</th>
            <th className="p-2 text-right font-normal">Expectancy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, s]) => (
            <tr key={name} className="border-b last:border-0">
              <th scope="row" className="p-2 text-left font-normal">
                {name}
              </th>
              <td className="p-2 text-right num">{s.trades}</td>
              <td className={cn('p-2 text-right num', s.net.gt(0) && 'text-profit', s.net.lt(0) && 'text-loss')}>
                {formatMoney(s.net)}
              </td>
              <td className="p-2 text-right num">{formatPct(s.winRate)}</td>
              <td className="p-2 text-right num">{formatR(s.expectancyR)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
