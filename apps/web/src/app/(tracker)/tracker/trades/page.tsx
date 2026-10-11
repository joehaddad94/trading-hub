import { SESSION_LABELS, type SessionName } from '@trading/core';
import type { Route } from 'next';
import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import type { ReactNode } from 'react';
import { formatMoney, formatPct } from '@/lib/format';
import { formatR } from '@/modules/tracker/calendar/format';
import { ScopeNotice } from '@/modules/tracker/components/scope-notice';
import { TradeFilters } from '@/modules/tracker/components/trade-filters';
import { TradesTable } from '@/modules/tracker/components/trades-table';
import { accountLabel } from '@/modules/tracker/scope-label';
import { getPageScope } from '@/modules/tracker/server/scope';
import { getTradesPage } from '@/modules/tracker/server/trades';
import { parseTradeParams, type TradeParams, tradeQuery } from '@/modules/tracker/trade-params';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SORTABLE = ['closed', 'symbol', 'lots', 'net', 'r', 'hold'] as const;
const FILTER_KEYS = ['account', 'symbol', 'side', 'session', 'weekday', 'tag', 'plan', 'news', 'from', 'to'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

/** Trades (§8.3 screen 5): every trade in scope, filterable and sortable, with CSV export of the filtered view. */
export default async function TradesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const scope = await getPageScope(searchParams);
  if (!scope) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const params = parseTradeParams(raw as Record<string, string | string[] | undefined>);
  const data = await getTradesPage(scope, params);
  if (!data) return null;
  const scopeParam = raw.scope?.toString() ?? 'all';
  const href = (overrides: Partial<TradeParams>) => {
    const q = tradeQuery(scopeParam, params, overrides);
    return `/tracker/trades${q ? `?${q}` : ''}`;
  };
  const headers = Object.fromEntries(
    SORTABLE.map((key) => {
      const active = params.sort === key ? params.dir : undefined;
      return [key, { label: key, href: href({ sort: key, dir: active === 'desc' ? 'asc' : 'desc', page: 1 }), active }];
    }),
  );
  const csvQuery = tradeQuery(scopeParam, { ...params, page: 1 });
  const select = 'h-11 rounded-md border bg-background px-2 text-sm md:h-9';
  const cleared = Object.fromEntries(FILTER_KEYS.map((k) => [k, null])) as Partial<TradeParams>;
  const clearHref = href({ ...cleared, page: 1 });
  const chipLabel: Record<FilterKey, (v: string) => string> = {
    account: (v) => {
      const a = scope.accounts.find((x) => String(x.login) === v);
      return a ? accountLabel(a) : v;
    },
    symbol: (v) => v,
    side: (v) => (v === 'buy' ? 'Buy' : 'Sell'),
    session: (v) => SESSION_LABELS[v as SessionName] ?? v,
    weekday: (v) => WEEKDAYS[Number(v) - 1] ?? v,
    tag: (v) => `#${v}`,
    plan: (v) => ({ yes: 'Followed plan', no: 'Broke plan', unanswered: 'Plan not answered' })[v] ?? v,
    news: (v) => (v === 'yes' ? 'News trades' : 'No news'),
    from: (v) => `From ${v}`,
    to: (v) => `To ${v}`,
  };
  const chips = FILTER_KEYS.flatMap((key) => {
    const v = params[key];
    if (v === null || v === undefined || v === '') return [];
    return [{ key, label: chipLabel[key](String(v)), href: href({ [key]: null, page: 1 }) }];
  });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-xl">Trades</h2>
        <a
          href={`/api/tracker/trades.csv${csvQuery ? `?${csvQuery}` : ''}`}
          className="flex h-11 items-center rounded-md border px-3 text-sm hover:bg-accent md:h-9"
          download
        >
          Export CSV
        </a>
      </div>
      <ScopeNotice scope={scope} />
      <TradeFilters fieldsKey={csvQuery} chips={chips} clearHref={clearHref}>
        <Select name="account" label="Account" value={params.account} className={select}>
          {scope.accounts.map((a) => (
            <option key={a.id} value={a.login}>
              {accountLabel(a)}
            </option>
          ))}
        </Select>
        <Select name="symbol" label="Symbol" value={params.symbol} className={select}>
          {data.options.symbols.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select name="side" label="Side" value={params.side} className={select}>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </Select>
        <Select name="session" label="Session" value={params.session} className={select}>
          {(Object.keys(SESSION_LABELS) as SessionName[]).map((s) => (
            <option key={s} value={s}>
              {SESSION_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          name="weekday"
          label="Weekday"
          value={params.weekday ? String(params.weekday) : null}
          className={select}
        >
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </Select>
        <Select name="tag" label="Tag" value={params.tag} className={select}>
          {data.options.tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select name="plan" label="Followed plan" value={params.plan} className={select}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="unanswered">Not answered</option>
        </Select>
        <Select name="news" label="News" value={params.news} className={select}>
          <option value="yes">News trades</option>
          <option value="no">No news</option>
        </Select>
        <label className="flex flex-col gap-1 text-muted-foreground text-xs">
          From
          <input type="date" name="from" defaultValue={params.from ?? ''} className={select} />
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground text-xs">
          To
          <input type="date" name="to" defaultValue={params.to ?? ''} className={select} />
        </label>
      </TradeFilters>
      <p className="text-sm" data-testid="trades-summary">
        {data.total} trades · {formatMoney(data.stats.net)} · {formatPct(data.stats.winRate)} win rate · PF{' '}
        {data.stats.profitFactor?.toFixed(2) ?? '—'} · {formatR(data.stats.expectancyR)} expectancy
      </p>
      <TradesTable rows={data.rows} accounts={scope.accounts} headers={headers} />
      {data.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
          {data.page > 1 && <Link href={href({ page: data.page - 1 }) as Route}>‹ Previous</Link>}
          <span>
            Page {data.page} of {data.pages}
          </span>
          {data.page < data.pages && <Link href={href({ page: data.page + 1 }) as Route}>Next ›</Link>}
        </nav>
      )}
    </div>
  );
}

function Select({
  name,
  label,
  value,
  className,
  children,
}: {
  name: string;
  label: string;
  value: string | null | undefined;
  className: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-muted-foreground text-xs">
      {label}
      <select name={name} defaultValue={value ?? ''} className={className}>
        <option value="">All</option>
        {children}
      </select>
    </label>
  );
}
