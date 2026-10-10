import { rMultiple, SESSION_LABELS, sessionOf } from '@trading/core';
import type { ListTrade } from '@trading/tracker';
import type { ScopeAccount } from '@trading/tracker/server';
import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import { formatBeirut, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatHold, formatR } from '../calendar/format';
import { accountLabel } from '../scope-label';
import { StatusBadge } from './account-badge';

type SortHeader = { label: string; href?: string | undefined; active?: 'asc' | 'desc' | undefined };

/** Opens the trade from anywhere on its row: the link's overlay covers the row (which must be `relative`). */
const ROW_LINK = 'after:absolute after:inset-0 after:content-[""]';

/** Trades list: a table on desktop, cards on phone. Every row says which account it came from (§8.1). */
export function TradesTable({
  rows,
  accounts,
  headers,
}: {
  rows: ListTrade[];
  accounts: ScopeAccount[];
  headers?: Partial<Record<'closed' | 'symbol' | 'lots' | 'net' | 'r' | 'hold', SortHeader>>;
}) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const head = (key: 'closed' | 'symbol' | 'lots' | 'net' | 'r' | 'hold', label: string) => {
    const h = headers?.[key];
    if (!h?.href) return label;
    return (
      <Link
        href={h.href as Route}
        className="hover:underline"
        aria-sort={h.active === 'asc' ? 'ascending' : h.active === 'desc' ? 'descending' : undefined}
      >
        {label}
        {h.active === 'asc' ? ' ↑' : h.active === 'desc' ? ' ↓' : ''}
      </Link>
    );
  };
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">No trades match.</p>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm" data-testid="trades-table">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2 font-normal">{head('closed', 'Closed')}</th>
              <th className="p-2 font-normal">Account</th>
              <th className="p-2 font-normal">{head('symbol', 'Symbol')}</th>
              <th className="p-2 font-normal">Side</th>
              <th className="p-2 text-right font-normal">{head('lots', 'Lots')}</th>
              <th className="p-2 font-normal">Session</th>
              <th className="p-2 text-right font-normal">{head('hold', 'Hold')}</th>
              <th className="p-2 text-right font-normal">{head('net', 'Net')}</th>
              <th className="p-2 text-right font-normal">{head('r', 'R')}</th>
              <th className="p-2 font-normal">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const a = byId.get(t.accountId);
              const net = new Decimal(t.netProfit);
              return (
                <tr key={t.id} className="relative border-b last:border-0 hover:bg-muted/50" data-testid="trade-row">
                  <td className="p-2 tabular-nums">{formatBeirut(t.closedAt, 'd MMM yy HH:mm')}</td>
                  <td className="p-2">
                    {a ? (
                      <Link
                        href={`/tracker/accounts/${a.login}` as Route}
                        className="relative z-10 inline-flex items-center gap-1 hover:underline"
                      >
                        <span className="tabular-nums">{accountLabel(a)}</span>
                        <StatusBadge status={a.status} />
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2">
                    <Link href={`/tracker/trades/${t.id}` as Route} className={cn('font-medium', ROW_LINK)}>
                      {t.symbol}
                    </Link>
                  </td>
                  <td className="p-2 capitalize">{t.side}</td>
                  <td className="p-2 text-right tabular-nums">{t.lots}</td>
                  <td className="p-2">{SESSION_LABELS[sessionOf(t.openedAt)]}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatHold(t.closedAt.getTime() - t.openedAt.getTime())}
                  </td>
                  <td
                    className={cn('p-2 text-right tabular-nums', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}
                  >
                    {formatMoney(t.netProfit)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatR(rMultiple(t.netProfit, t.riskUsd))}
                    {t.riskSource === 'estimated' && <EstBadge />}
                  </td>
                  <td className="p-2 text-xs">
                    <Flags trade={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden" data-testid="trades-cards">
        {rows.map((t) => {
          const a = byId.get(t.accountId);
          const net = new Decimal(t.netProfit);
          return (
            <li
              key={t.id}
              className="relative rounded-lg border p-3 text-sm active:bg-muted/50"
              data-testid="trade-row"
            >
              <div className="flex items-center justify-between gap-2">
                <Link href={`/tracker/trades/${t.id}` as Route} className={cn('font-medium', ROW_LINK)}>
                  {t.symbol} <span className="capitalize">{t.side}</span> · {t.lots}
                </Link>
                <span
                  className={cn('font-semibold tabular-nums', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}
                >
                  {formatMoney(t.netProfit)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
                <span>
                  {a ? accountLabel(a) : '—'} · {formatBeirut(t.closedAt, 'd MMM HH:mm')} ·{' '}
                  {SESSION_LABELS[sessionOf(t.openedAt)]}
                </span>
                <span className="inline-flex items-center gap-2 tabular-nums">
                  <Flags trade={t} />
                  <span>
                    {formatR(rMultiple(t.netProfit, t.riskUsd))}
                    {t.riskSource === 'estimated' && <EstBadge />}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function EstBadge() {
  return (
    <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Risk is estimated">
      est.
    </span>
  );
}

/** Quiet by design: one amber dot for "needs journal" (the R column already marks estimated risk). */
function Flags({ trade: t }: { trade: ListTrade }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {t.isNews && <span title="News trade">📰</span>}
      {t.journaled ? (
        <span title="Journaled">📝</span>
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full bg-amber-400"
          title="Not journaled"
          data-testid="needs-journal"
        >
          <span className="sr-only">Not journaled</span>
        </span>
      )}
      {t.tags.map((tag) => (
        <span key={tag} className="rounded bg-muted px-1">
          {tag}
        </span>
      ))}
    </span>
  );
}
