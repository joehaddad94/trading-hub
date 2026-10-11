import { IMPACT_COLOURS, rMultiple, SESSION_LABELS, sessionOf } from '@trading/core';
import type { DayDetail, DayTrade, ScopeAccount } from '@trading/tracker/server';
import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ActionResult } from '@/lib/action-result';
import { formatBeirut, formatMoney, formatPct } from '@/lib/format';
import { formatPrice } from '@/lib/symbols';
import { cn } from '@/lib/utils';
import { AccountBadge } from '../components/account-badge';
import { accountLabel } from '../scope-label';
import { DailyNoteForm } from './daily-note-form';
import { EquityChart, type EquityPoint, type EquitySeries } from './equity-chart';
import { ACCOUNT_COLOURS, formatHold, formatR } from './format';

type Props = {
  detail: DayDetail;
  accounts: ScopeAccount[];
  closeHref: string;
  saveNote: (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;
};

const time = (d: Date) => formatBeirut(d, 'HH:mm:ss');
const money = (v: Decimal.Value) => formatMoney(new Decimal(v).toFixed(2));

/** Day view (§8.2): side panel on desktop, full screen on phone. */
export function DayView({ detail, accounts, closeHref, saveNote }: Props) {
  const { stats, trades, rules, statusEvents, note, date, events } = detail;
  const byId = new Map(accounts.map((a, i) => [a.id, { ...a, colour: ACCOUNT_COLOURS[i % ACCOUNT_COLOURS.length] }]));
  const balance = Decimal.sum(0, ...stats.accountIds.map((id) => byId.get(id)?.startingBalance ?? 0));
  const title = formatBeirut(new Date(`${date}T12:00:00Z`), 'EEEE d MMMM yyyy');

  const summary: [string, string][] = [
    ['Trades', `${stats.trades} (${stats.wins} W · ${stats.losses} L · ${stats.scratches} scratch)`],
    ['Win rate', formatPct(stats.winRate)],
    [
      'Net P/L',
      `${formatMoney(stats.net)} · ${formatR(stats.netR)}${balance.gt(0) ? ` · ${stats.net.div(balance).times(100).toFixed(2)}%` : ''}`,
    ],
    ['Gross profit / loss', `${formatMoney(stats.grossProfit)} / ${formatMoney(stats.grossLoss.negated())}`],
    ['Profit factor', stats.profitFactor ? stats.profitFactor.toFixed(2) : '—'],
    ['Commission + swap', formatMoney(stats.commissionSwap)],
    ['Lots', stats.lots.toFixed(2)],
    ['Avg hold', formatHold(stats.avgHoldMs)],
    ['Best trade', stats.best ? `${money(stats.best.netProfit)} · ${stats.best.symbol}` : '—'],
    ['Worst trade', stats.worst ? `${money(stats.worst.netProfit)} · ${stats.worst.symbol}` : '—'],
    ['Symbols', stats.symbols.join(', ') || '—'],
    ['Sessions', stats.sessions.map((s) => SESSION_LABELS[s]).join(', ') || '—'],
  ];

  return (
    <section
      aria-label={`Day view, ${title}`}
      data-testid="day-view"
      className="fixed inset-0 z-40 overflow-y-auto bg-background p-4 lg:static lg:z-auto lg:max-h-[calc(100dvh-5rem)] lg:rounded-lg lg:border"
    >
      <header className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-lg">{title}</h3>
        <Link
          href={closeHref as Route}
          scroll={false}
          className="flex h-11 items-center rounded-md px-3 text-sm hover:bg-accent"
          aria-label="Close day view"
        >
          Close
        </Link>
      </header>

      {stats.trades === 0 ? (
        <p className="mb-4 text-muted-foreground text-sm">No trades this day in the current scope.</p>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {summary.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium num">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mb-4 flex flex-wrap gap-2">
            {stats.accountIds.map((id) => {
              const a = byId.get(id);
              return a ? <AccountBadge key={id} account={a} colour={a.colour} /> : null;
            })}
          </div>

          <Section title="Risk and rules">
            <p className="mb-2 text-muted-foreground text-xs">
              From closed trades and the latest daily balance snapshot.
            </p>
            <ul className="flex flex-col gap-3">
              {rules.map(({ accountId, usage }) => {
                const a = byId.get(accountId);
                return (
                  <li
                    key={accountId}
                    className={cn('rounded-md border p-2 text-sm', usage.warning && 'border-warning')}
                  >
                    <p className="mb-1 font-medium">
                      {a ? accountLabel(a) : '—'} {usage.warning && <span title="Close to a rule limit">⚠️</span>}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <dt className="text-muted-foreground">Start / end balance</dt>
                      <dd className="num">
                        {formatMoney(usage.startBalance)} / {formatMoney(usage.endBalance)}
                      </dd>
                      <dt className="text-muted-foreground">Daily loss used</dt>
                      <dd className="num">
                        {formatMoney(usage.dailyLossUsed)}
                        {usage.dailyLossLimit
                          ? ` of ${formatMoney(usage.dailyLossLimit)} (${formatPct(usage.dailyLossUsedShare)})`
                          : ' · no limit on file'}
                      </dd>
                      <dt className="text-muted-foreground">To max-loss limit</dt>
                      <dd className="num">
                        {usage.distanceToMaxLoss ? formatMoney(usage.distanceToMaxLoss) : 'no limit on file'}
                      </dd>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Equity during the day">
            <EquityChart {...equityData(trades, byId)} />
          </Section>
        </>
      )}

      {statusEvents.length > 0 && (
        <Section title="Account events">
          <ul className="text-sm">
            {statusEvents.map((e) => (
              <li key={`${e.accountId}-${e.status}`}>
                {e.login} <span className="capitalize">{e.status.replace(/_/g, ' ')}</span>
                {e.reason ? ` — ${e.reason}` : ''} · {time(e.at)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {events.length > 0 && (
        <Section title="News">
          <ul className="flex flex-col gap-1 text-sm" data-testid="day-news">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="num">{e.impact === 'holiday' ? 'All day' : time(e.eventAt)}</span>
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: IMPACT_COLOURS[e.impact] }}
                  title={`${e.impact} impact`}
                />
                <span className="font-medium">{e.currency}</span>
                <span className="min-w-0 truncate">{e.title}</span>
                {e.isRestricted && <span title="Restricted">🔒</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {trades.length > 0 && (
        <Section title="Trades">
          <ul className="flex flex-col gap-2" data-testid="day-trades">
            {trades.map((t) => (
              <TradeRow key={t.id} trade={t} account={byId.get(t.accountId)} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Daily note">
        <DailyNoteForm date={date} note={note} save={saveNote} />
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h4 className="mb-2 font-medium text-sm">{title}</h4>
      {children}
    </section>
  );
}

function TradeRow({
  trade: t,
  account,
}: {
  trade: DayTrade;
  account: (ScopeAccount & { colour?: string | undefined }) | undefined;
}) {
  const net = new Decimal(t.netProfit);
  const r = rMultiple(t.netProfit, t.riskUsd);
  const pct = account ? net.div(account.startingBalance).times(100).toFixed(2) : null;
  const facts: [string, string][] = [
    ['Lots', t.lots],
    ['Open → close', `${time(t.openedAt)} → ${time(t.closedAt)}`],
    ['Hold', formatHold(t.closedAt.getTime() - t.openedAt.getTime())],
    ['Entry → exit', `${formatPrice(t.openPrice)} → ${formatPrice(t.closePrice)}`],
    ['SL / TP (final)', `${formatPrice(t.slFinal)} / ${formatPrice(t.tpFinal)}`],
    ['Firm RR', t.firmRr ?? '—'],
    ['Session', SESSION_LABELS[sessionOf(t.openedAt)]],
    ['Tags', t.tags.join(', ') || '—'],
    ['Followed plan', t.followedPlan === null ? '—' : t.followedPlan ? 'Yes' : 'No'],
    ['Journal', t.journaled ? 'Journaled' : 'Not journaled'],
  ];
  return (
    <li className="rounded-md border p-2 text-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        {account ? <AccountBadge account={account} colour={account.colour} /> : <span>—</span>}
        <span className={cn('font-semibold num', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}>
          {formatMoney(t.netProfit)}
          {pct ? ` · ${pct}%` : ''} · {formatR(r)}
          {t.riskSource === 'estimated' && (
            <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Risk is estimated">
              est.
            </span>
          )}
        </span>
      </div>
      <p className="mb-1 font-medium">
        {t.symbol} <span className="capitalize">{t.side}</span> {t.isNews && <span title="News trade">📰</span>}
        {t.riskSource === 'estimated' && (
          <span className="ml-2 text-warning text-xs" title="Add the initial stop loss when journaling">
            risk missing
          </span>
        )}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num">{value}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/tracker/trades/${t.id}` as Route}
        className="mt-2 inline-flex h-11 items-center text-sm underline-offset-4 hover:underline md:h-8"
      >
        {t.journaled ? 'Open journal' : 'Journal this trade'} →
      </Link>
    </li>
  );
}

/** Cumulative closed P/L through the day, per account and combined, as plain numbers for the chart. */
function equityData(
  trades: DayTrade[],
  byId: Map<string, ScopeAccount & { colour?: string | undefined }>,
): { points: EquityPoint[]; series: EquitySeries[] } {
  const accountIds = [...new Set(trades.map((t) => t.accountId))];
  const running = new Map<string, Decimal>();
  let combined = new Decimal(0);
  const start = Math.min(...trades.map((t) => t.openedAt.getTime()));
  const points: EquityPoint[] = [
    { t: start, trade: 'Start', combined: 0, ...Object.fromEntries(accountIds.map((id) => [id, 0])) },
  ];
  for (const t of trades) {
    combined = combined.plus(t.netProfit);
    running.set(t.accountId, (running.get(t.accountId) ?? new Decimal(0)).plus(t.netProfit));
    points.push({
      t: t.closedAt.getTime(),
      trade: `${t.symbol} ${t.side} ${new Decimal(t.netProfit).gte(0) ? '+' : ''}${money(t.netProfit)}`,
      combined: combined.toNumber(),
      ...Object.fromEntries(accountIds.map((id) => [id, running.get(id)?.toNumber() ?? 0])),
    });
  }
  const series: EquitySeries[] = [
    { key: 'combined', label: 'Combined', colour: '#f6f8fb' },
    ...(accountIds.length > 1
      ? accountIds.map((id) => {
          const a = byId.get(id);
          return { key: id, label: a ? accountLabel(a) : id, colour: a?.colour ?? '#888' };
        })
      : []),
  ];
  return { points, series };
}
