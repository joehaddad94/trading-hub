import { type CalendarDay, type PeriodSummary, rMultiple } from '@trading/core';
import type { CalendarMonthData, ScopeAccount } from '@trading/tracker/server';
import type { ReactNode } from 'react';
import { formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { accountLabel } from '../scope-label';
import { DayCell, type DayCellProps } from './day-cell';
import { ACCOUNT_COLOURS, cellValue, formatMoneyShort, formatR, pluralTrades } from './format';
import type { CellMode } from './search-params';

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PREVIEW_TRADES = 3;

export type CalendarGridProps = {
  data: CalendarMonthData;
  cell: CellMode;
  accounts: ScopeAccount[];
  selectedDay: string | null;
  /** Link that opens a day in the day view (keeps scope, month and cell mode). */
  dayHref: (date: string) => string;
};

/** The §8.2 month grid: Mon–Fri (weekends only when traded), weekly summary column, one component for any scope. */
export function CalendarGrid({ data, cell, accounts, selectedDay, dayHref }: CalendarGridProps) {
  const { calendar, statusEvents, warningDays, startingBalanceTotal } = data;
  const colourOf = new Map(accounts.map((a, i) => [a.id, ACCOUNT_COLOURS[i % ACCOUNT_COLOURS.length] ?? '#888']));
  const loginOf = new Map(accounts.map((a) => [a.id, accountLabel(a)]));
  const statusDays = new Set(statusEvents.map((e) => e.day));
  const warnings = new Set(warningDays);
  const newsDays = new Set(data.newsDays);
  const columns = calendar.weekdays.length;

  const cellProps = (d: CalendarDay, index: number): DayCellProps => {
    const s = d.stats;
    return {
      date: d.date,
      day: d.day,
      inMonth: d.inMonth,
      isToday: d.isToday,
      selected: d.date === selectedDay,
      href: dayHref(d.date),
      value: s ? cellValue(s, cell, startingBalanceTotal) : null,
      valueShort: s ? cellValue(s, cell, startingBalanceTotal, true) : null,
      sub: s && cell !== 'count' ? pluralTrades(s.trades) : null,
      tone: s ? (s.net.gt(0) ? 'win' : s.net.lt(0) ? 'loss' : 'flat') : null,
      intensity: d.intensity,
      icons: {
        news: (s?.hasNews ?? false) || (d.inMonth && newsDays.has(d.date)),
        journaled: s?.journaled ?? false,
        warning: warnings.has(d.date),
        status: d.inMonth && statusDays.has(d.date),
      },
      dots: s ? s.accountIds.map((id) => colourOf.get(id) ?? '#888') : [],
      preview: s
        ? {
            wl: `${s.wins} W · ${s.losses} L${s.scratches ? ` · ${s.scratches} scratch` : ''} · ${formatPct(s.winRate)} win rate`,
            trades: s.entries.slice(0, PREVIEW_TRADES).map((t) => ({
              key: t.id,
              account: loginOf.get(t.accountId) ?? '—',
              symbol: t.symbol,
              side: t.side,
              net: formatMoney(t.netProfit),
              r: formatR(rMultiple(t.netProfit, t.riskUsd)),
            })),
            more: Math.max(0, s.entries.length - PREVIEW_TRADES),
          }
        : null,
      align: index < 2 ? 'start' : index >= columns - 2 ? 'end' : 'center',
    };
  };

  return (
    <div
      data-testid="calendar-grid"
      className={cn(
        'grid gap-1',
        columns === 5
          ? 'grid-cols-5 md:grid-cols-[repeat(5,minmax(0,1fr))_9rem]'
          : 'grid-cols-7 md:grid-cols-[repeat(7,minmax(0,1fr))_9rem]',
      )}
    >
      {calendar.weekdays.map((w) => (
        <div key={w} className="px-1 text-center text-muted-foreground text-xs">
          {WEEKDAY_NAMES[w - 1]}
        </div>
      ))}
      <div className="hidden px-1 text-muted-foreground text-xs md:block">Week</div>
      {calendar.weeks.map((week) => (
        <Week key={week.days[0]?.date} summary={week.summary} cell={cell} total={startingBalanceTotal}>
          {week.days.map((d, i) => (
            <DayCell key={d.date} {...cellProps(d, i)} />
          ))}
        </Week>
      ))}
    </div>
  );
}

function Week({
  children,
  summary,
  cell,
  total,
}: {
  children: ReactNode;
  summary: PeriodSummary;
  cell: CellMode;
  total: string;
}) {
  const tone = summary.net.gt(0) ? 'text-profit' : summary.net.lt(0) ? 'text-loss' : 'text-muted-foreground';
  return (
    <>
      {children}
      <div
        className="col-span-full mb-2 flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1 text-[11px] md:col-span-1 md:mb-0 md:flex-col md:items-start md:justify-center md:text-xs"
        data-testid="week-summary"
      >
        {summary.trades === 0 ? (
          <span className="text-muted-foreground">No trades</span>
        ) : (
          <>
            <span className={cn('font-semibold tabular-nums', tone)}>
              {cell === 'pct' ? cellValue(summary, 'pct', total) : formatMoneyShort(summary.net)}
              <span className="ml-1 font-normal text-muted-foreground">{formatR(summary.netR)}</span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {pluralTrades(summary.trades)} · {formatPct(summary.winRate)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {summary.greenDays} green · {summary.redDays} red
            </span>
          </>
        )}
      </div>
    </>
  );
}
