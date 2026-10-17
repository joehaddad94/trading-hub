import type { MonthSummary as Summary } from '@trading/core';
import type { StatusEvent } from '@trading/tracker/server';
import { formatBeirut, formatMoney, formatPct } from '@/lib/format';
import { formatR } from './format';

const day = (date: string) => formatBeirut(new Date(`${date}T12:00:00Z`), 'EEE d MMM');

/** Month summary panel (§8.2). */
export function MonthSummary({ summary, statusEvents }: { summary: Summary; statusEvents: StatusEvent[] }) {
  const items: [string, string][] = [
    ['Net P/L', `${formatMoney(summary.net)} · ${formatR(summary.netR)}`],
    ['Trading days', String(summary.tradingDays)],
    ['Green / red days', `${summary.greenDays} / ${summary.redDays}`],
    ['Best day', summary.bestDay ? `${formatMoney(summary.bestDay.net)} · ${day(summary.bestDay.date)}` : '—'],
    ['Worst day', summary.worstDay ? `${formatMoney(summary.worstDay.net)} · ${day(summary.worstDay.date)}` : '—'],
    ['Win rate', formatPct(summary.winRate)],
    ['Profit factor', summary.profitFactor ? summary.profitFactor.toFixed(2) : '—'],
    ['Expectancy', formatR(summary.expectancyR)],
    ['Avg trades / day', summary.avgTradesPerDay ? summary.avgTradesPerDay.toFixed(1) : '—'],
    ['Longest streaks', `${summary.longestGreenStreak} green · ${summary.longestRedStreak} red`],
    ['Commission + swap', formatMoney(summary.commissionSwap)],
    ['Days following plan', formatPct(summary.planFollowedRate)],
  ];
  return (
    <section aria-labelledby="month-summary" className="glass rounded-xl p-4" data-testid="month-summary">
      <h3 id="month-summary" className="mb-3 font-medium">
        Month summary
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3 xl:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium num">{value}</dd>
          </div>
        ))}
      </dl>
      <h4 className="mt-4 mb-1 text-muted-foreground text-sm">Account events this month</h4>
      {statusEvents.length === 0 ? (
        <p className="text-sm">None.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {statusEvents.map((e) => (
            <li key={`${e.accountId}-${e.status}-${e.day}`}>
              {day(e.day)} · {e.login} <span className="capitalize">{e.status.replace(/_/g, ' ')}</span>
              {e.reason ? ` — ${e.reason}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
