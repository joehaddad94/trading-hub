import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { formatBeirut, formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatR } from '@/modules/tracker/calendar/format';
import { TrackerCalendar } from '@/modules/tracker/calendar/tracker-calendar';
import { StatusBadge } from '@/modules/tracker/components/account-badge';
import { BalanceCurve } from '@/modules/tracker/components/balance-curve';
import { TradesTable } from '@/modules/tracker/components/trades-table';
import { PHASE_LABELS } from '@/modules/tracker/scope-label';
import { getAccountDetail, getAccountScope } from '@/modules/tracker/server/accounts';
import { getCalendarMonth, readCalendarParams } from '@/modules/tracker/server/calendar';
import { getTradesPage } from '@/modules/tracker/server/trades';
import { parseTradeParams } from '@/modules/tracker/trade-params';

const TABS = ['overview', 'calendar', 'trades', 'journal'] as const;
type Tab = (typeof TABS)[number];
const date = (d: Date | null) => (d ? formatBeirut(d, 'd MMM yyyy') : '—');

export const metadata = { title: 'Account · Tracker' };

/** Account detail (§8.3 screen 3): header card like FundedNext's, then Overview · Calendar · Trades · Journal. */
export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ login: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { login: raw } = await params;
  if (!/^\d{1,20}$/.test(raw)) notFound();
  const login = Number(raw);
  const [a, scope] = await Promise.all([getAccountDetail(login), getAccountScope(login)]);
  if (!a || !scope) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'overview';
  const balance = new Decimal(a.startingBalance);
  const size = balance.gte(1000) ? `${balance.div(1000).toDecimalPlaces(0).toString()}K` : balance.toFixed(0);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <section className="rounded-lg border p-4" data-testid="account-header">
        <p className="text-muted-foreground text-sm">
          {PHASE_LABELS[a.phase] ?? a.phase} · {size} · {a.firm}
          {a.isDemo ? ' · demo' : ' · real'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-2xl tabular-nums">{a.login}</h2>
          <StatusBadge status={a.status} />
          {a.platform && <span className="text-muted-foreground text-sm capitalize">{a.platform}</span>}
        </div>
        {a.statusReason && <p className="mt-1 text-sm">{a.statusReason}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Cycle</dt>
            <dd>
              {date(a.currentCycle?.startedAt ?? a.startedAt)} →{' '}
              {a.currentCycle?.endsAt ? date(a.currentCycle.endsAt) : 'open'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="tabular-nums">{a.finalBalance ? formatMoney(a.finalBalance) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Net P/L</dt>
            <dd className={cn('tabular-nums', a.stats.net.gt(0) && 'text-profit', a.stats.net.lt(0) && 'text-loss')}>
              {formatMoney(a.stats.net)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trades · win rate</dt>
            <dd className="tabular-nums">
              {a.stats.trades} · {formatPct(a.stats.winRate)}
            </dd>
          </div>
        </dl>
      </section>

      <nav aria-label="Account sections" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/tracker/accounts/${a.login}${t === 'overview' ? '' : `?tab=${t}`}` as Route}
            aria-current={tab === t ? 'page' : undefined}
            className={cn(
              'flex h-11 shrink-0 items-center border-b-2 px-3 text-sm capitalize md:h-9',
              tab === t ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground',
            )}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab a={a} />}
      {tab === 'calendar' && <CalendarTab login={a.login} scope={scope} searchParams={searchParams} />}
      {tab === 'trades' && <TradesTab scope={scope} sp={sp} />}
      {tab === 'journal' && <p className="text-muted-foreground text-sm">The journal arrives in M9.</p>}
    </div>
  );
}

type Detail = NonNullable<Awaited<ReturnType<typeof getAccountDetail>>>;

function OverviewTab({ a }: { a: Detail }) {
  const s = a.stats;
  const u = a.rules?.usage;
  const stats: [string, string][] = [
    ['Win rate vs breakeven', `${formatPct(s.winRate)} vs ${formatPct(s.breakevenWinRate)}`],
    ['Profit factor', s.profitFactor?.toFixed(2) ?? '—'],
    ['Expectancy', formatR(s.expectancyR)],
    ['Avg win / loss', `${s.avgWin ? formatMoney(s.avgWin) : '—'} / ${s.avgLoss ? formatMoney(s.avgLoss) : '—'}`],
    ['Max drawdown', a.maxDrawdown ? formatMoney(a.maxDrawdown.amount.negated()) : '—'],
    ['Scratches', String(s.scratches)],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border p-4 lg:col-span-2">
        <h3 className="mb-2 font-medium">Balance</h3>
        <BalanceCurve
          points={a.equity.map((p, i) => ({
            t: p.at.getTime(),
            balance: Number(p.balance),
            pnl: new Decimal(p.balance).minus(a.equity[i - 1]?.balance ?? a.startingBalance).toNumber(),
          }))}
          start={Number(a.startingBalance)}
          floor={u?.maxLossFloor ? u.maxLossFloor.toNumber() : null}
        />
      </section>
      <section className="rounded-lg border p-4">
        <h3 className="mb-2 font-medium">Stats</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="rounded-lg border p-4" data-testid="rule-limits">
        <h3 className="mb-2 font-medium">
          Rule limits
          {a.rules && (
            <span className="ml-2 font-normal text-muted-foreground text-xs">
              from the export of {formatBeirut(a.rules.takenAt, 'd MMM yyyy HH:mm')}
            </span>
          )}
        </h3>
        {!a.rules || !u ? (
          <p className="text-muted-foreground text-sm">No rule data in the exports for this account.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Daily loss limit</dt>
              <dd className="tabular-nums">
                {a.rules.dailyLossPct
                  ? `${Number(a.rules.dailyLossPct)}% · ${u.dailyLossLimit ? formatMoney(u.dailyLossLimit) : '—'}`
                  : '—'}
              </dd>
              <dt className="text-muted-foreground">Max loss limit</dt>
              <dd className="tabular-nums">
                {a.rules.maxLossPct
                  ? `${Number(a.rules.maxLossPct)}% · floor ${u.maxLossFloor ? formatMoney(u.maxLossFloor) : '—'}`
                  : '—'}
              </dd>
              <dt className="text-muted-foreground">Profit target</dt>
              <dd className="tabular-nums">{a.rules.profitTargetPct ? `${Number(a.rules.profitTargetPct)}%` : '—'}</dd>
              <dt className="text-muted-foreground">
                Daily loss used ({formatBeirut(new Date(`${a.rules.lastDay}T12:00:00Z`), 'd MMM')})
              </dt>
              <dd className={cn('tabular-nums', u.warning && 'text-amber-400')}>
                {formatMoney(u.dailyLossUsed)} ({formatPct(u.dailyLossUsedShare)})
              </dd>
              <dt className="text-muted-foreground">Distance to max loss</dt>
              <dd className="tabular-nums">{u.distanceToMaxLoss ? formatMoney(u.distanceToMaxLoss) : '—'}</dd>
            </dl>
            <p className="mt-2 text-muted-foreground text-xs">
              Based on closed trades and daily snapshots, not live equity.
            </p>
          </>
        )}
      </section>
      <section className="rounded-lg border p-4 lg:col-span-2">
        <h3 className="mb-2 font-medium">Lifecycle</h3>
        <ol className="flex flex-col gap-2 border-l pl-4 text-sm" data-testid="lifecycle">
          {a.timeline.map((e) => (
            <li key={`${e.status}-${e.at.getTime()}`} className="relative">
              <span className="-left-[21px] absolute top-1.5 size-2.5 rounded-full bg-foreground" aria-hidden />
              <span className="text-muted-foreground tabular-nums">{formatBeirut(e.at, 'd MMM yyyy HH:mm')}</span> ·{' '}
              <span className="capitalize">{e.label}</span>
              {e.reason ? ` — ${e.reason}` : ''}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

async function CalendarTab({
  login,
  scope,
  searchParams,
}: {
  login: number;
  scope: NonNullable<Awaited<ReturnType<typeof getAccountScope>>>;
  searchParams: Promise<SearchParams>;
}) {
  const p = await readCalendarParams(searchParams);
  const data = await getCalendarMonth(scope, p.year, p.month);
  if (!data) return null;
  return (
    <TrackerCalendar
      data={data}
      accounts={scope.accounts}
      links={{ base: '/tracker/calendar', scope: `account:${login}`, cell: p.cell }}
      selectedDay={null}
      today={p.today}
    />
  );
}

async function TradesTab({
  scope,
  sp,
}: {
  scope: NonNullable<Awaited<ReturnType<typeof getAccountScope>>>;
  sp: Awaited<SearchParams>;
}) {
  const data = await getTradesPage(scope, parseTradeParams(sp as Record<string, string | string[] | undefined>));
  if (!data) return null;
  return (
    <>
      <p className="text-muted-foreground text-sm">
        Latest {data.rows.length} of {data.total}.{' '}
        <Link href={`/tracker/trades?scope=account:${scope.accounts[0]?.login ?? ''}` as Route} className="underline">
          Filter and export in Trades
        </Link>
      </p>
      <TradesTable rows={data.rows} accounts={scope.accounts} />
    </>
  );
}
