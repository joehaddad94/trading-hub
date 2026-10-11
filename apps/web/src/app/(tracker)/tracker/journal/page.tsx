import { formatMonthParam, shiftMonth } from '@trading/core';
import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { formatBeirut, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { calendarHref } from '@/modules/tracker/calendar/tracker-calendar';
import { ScopeNotice } from '@/modules/tracker/components/scope-notice';
import { QuickJournal } from '@/modules/tracker/journal/quick-journal';
import { RiskQueue } from '@/modules/tracker/journal/risk-queue';
import { accountLabel } from '@/modules/tracker/scope-label';
import { getCalendarMonth, readCalendarParams } from '@/modules/tracker/server/calendar';
import { getDailyNotes, getJournalQueue, getRiskQueue, getTags } from '@/modules/tracker/server/journal';
import { getPageScope } from '@/modules/tracker/server/scope';
import { quickJournalAction, tagRiskAction } from './actions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const metadata = { title: 'Journal · Tracker' };

/**
 * Journal: trades still to journal (screen 6 entry point), the risk queue (tag the % risked so R is real) and
 * daily notes over a P/L heat map (screen 10).
 */
export default async function JournalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const scope = await getPageScope(searchParams);
  if (!scope) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const scopeParam = raw.scope?.toString() ?? 'all';
  const view = raw.view === 'notes' || raw.view === 'risk' || raw.view === 'quick' ? raw.view : 'queue';
  const href = (params: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (scopeParam !== 'all') q.set('scope', scopeParam);
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    return (s ? `/tracker/journal?${s}` : '/tracker/journal') as Route;
  };
  const tab = (id: 'queue' | 'risk' | 'notes', label: string) => {
    const active = view === id || (id === 'queue' && view === 'quick');
    return (
      <Link
        href={href({ view: id === 'queue' ? null : id, month: raw.month?.toString() ?? null })}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-11 items-center border-b-2 px-3 text-sm md:h-9',
          active ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground',
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Journal</h2>
      <nav aria-label="Journal views" className="flex gap-1 border-b">
        {tab('queue', 'To journal')}
        {tab('risk', 'Tag risk')}
        {tab('notes', 'Daily notes')}
      </nav>
      <ScopeNotice scope={scope} />
      {view === 'queue' ? (
        <Queue scope={scope} quickHref={href({ view: 'quick' })} />
      ) : view === 'quick' ? (
        <Quick scope={scope} />
      ) : view === 'risk' ? (
        <Risk scope={scope} />
      ) : (
        <Notes scope={scope} searchParams={searchParams} scopeParam={scopeParam} href={href} />
      )}
    </div>
  );
}

async function Risk({ scope }: { scope: NonNullable<Awaited<ReturnType<typeof getPageScope>>> }) {
  const q = await getRiskQueue(scope);
  if (!q) return null;
  const byId = new Map(scope.accounts.map((a) => [a.id, a]));
  const items = q.trades.map((t) => {
    const a = byId.get(t.accountId);
    return { ...t, account: a ? accountLabel(a) : '—' };
  });
  return <RiskQueue items={items} total={q.count} tag={tagRiskAction} />;
}

async function Quick({ scope }: { scope: NonNullable<Awaited<ReturnType<typeof getPageScope>>> }) {
  const [q, tags] = await Promise.all([getJournalQueue(scope), getTags()]);
  if (!q) return null;
  const byId = new Map(scope.accounts.map((a) => [a.id, a]));
  // Oldest first, so a backlog is journaled in the order it was traded.
  const items = [...q.pending].reverse().map((t) => {
    const a = byId.get(t.accountId);
    return { ...t, account: a ? accountLabel(a) : '—' };
  });
  const setups = tags.filter((t) => t.kind === 'setup').map((t) => ({ id: t.id, name: t.name }));
  return <QuickJournal items={items} total={q.pendingCount} setups={setups} save={quickJournalAction} />;
}

async function Queue({
  scope,
  quickHref,
}: {
  scope: NonNullable<Awaited<ReturnType<typeof getPageScope>>>;
  quickHref: Route;
}) {
  const q = await getJournalQueue(scope);
  if (!q) return null;
  const byId = new Map(scope.accounts.map((a) => [a.id, a]));
  const row = (t: (typeof q.pending)[number], extra?: string) => {
    const net = new Decimal(t.netProfit);
    const a = byId.get(t.accountId);
    return (
      <li key={t.id}>
        <Link
          href={`/tracker/trades/${t.id}` as Route}
          className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          <span className="min-w-0">
            <span className="font-medium">
              {t.symbol} <span className="capitalize">{t.side}</span>
            </span>
            <span className="block truncate text-muted-foreground text-xs">
              {a ? accountLabel(a) : '—'} · {formatBeirut(t.closedAt, 'd MMM HH:mm')}
              {t.riskSource === 'estimated' ? ' · R estimated' : ''}
              {extra ? ` · ${extra}` : ''}
            </span>
          </span>
          <span className={cn('num', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}>
            {formatMoney(t.netProfit)}
          </span>
        </Link>
      </li>
    );
  };
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-sm" data-testid="journal-pending-count">
            {q.pendingCount} {q.pendingCount === 1 ? 'trade' : 'trades'} to journal
          </h3>
          {q.pendingCount > 0 && (
            <Link
              href={quickHref}
              className="flex h-11 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm md:h-9"
            >
              Quick journal
            </Link>
          )}
        </div>
        {q.pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">Everything in scope is journaled.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="journal-pending">
            {q.pending.map((t) => row(t))}
          </ul>
        )}
        {q.pendingCount > q.pending.length && (
          <p className="text-muted-foreground text-xs">Showing the newest {q.pending.length}.</p>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">Recently journaled</h3>
        {q.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing journaled yet.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="journal-recent">
            {q.recent.map((t) =>
              row(
                t,
                [
                  t.followedPlan === null ? null : t.followedPlan ? 'plan ✓' : 'plan ✗',
                  t.rating ? `${t.rating}★` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

async function Notes({
  scope,
  searchParams,
  scopeParam,
  href,
}: {
  scope: NonNullable<Awaited<ReturnType<typeof getPageScope>>>;
  searchParams: Promise<SearchParams>;
  scopeParam: string;
  href: (params: Record<string, string | null>) => Route;
}) {
  const { year, month, monthParam } = await readCalendarParams(searchParams);
  const data = await getCalendarMonth(scope, year, month);
  if (!data) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const notes = await getDailyNotes(`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(last)}`);
  const noteByDay = new Map(notes.map((n) => [n.date, n]));
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const links = { base: '/tracker/calendar', scope: scopeParam, cell: 'net' as const };
  const { weekdays } = data.calendar;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href={href({ view: 'notes', month: formatMonthParam(prev.year, prev.month) })}
          aria-label="Previous month"
          className="flex h-11 w-11 items-center justify-center rounded-md border md:h-9 md:w-9"
        >
          ‹
        </Link>
        <span className="min-w-24 text-center font-medium">
          {MONTHS[month - 1]} {year}
        </span>
        <Link
          href={href({ view: 'notes', month: formatMonthParam(next.year, next.month) })}
          aria-label="Next month"
          className="flex h-11 w-11 items-center justify-center rounded-md border md:h-9 md:w-9"
        >
          ›
        </Link>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${weekdays.length}, minmax(0, 1fr))` }}
        data-testid="notes-heatmap"
      >
        {weekdays.map((w) => (
          <div key={w} className="text-center text-muted-foreground text-xs">
            {WEEKDAYS[w - 1]}
          </div>
        ))}
        {data.calendar.weeks.flatMap((week) =>
          week.days.map((d) => {
            const net = d.stats?.net;
            const note = noteByDay.get(d.date);
            const colour = net?.gt(0) ? 'var(--profit)' : net?.lt(0) ? 'var(--loss)' : undefined;
            const alpha = Math.round((0.15 + d.intensity * 0.6) * 100);
            return (
              <Link
                key={d.date}
                href={calendarHref(links, { month: monthParam, day: d.date }) as Route}
                aria-label={`${d.date}${net ? ` ${formatMoney(net)}` : ''}${note ? ', has a note' : ''}`}
                className={cn(
                  'flex aspect-square flex-col justify-between rounded-md border p-1 text-xs md:aspect-[4/3]',
                  !d.inMonth && 'opacity-30',
                )}
                style={colour ? { background: `color-mix(in oklab, ${colour} ${alpha}%, transparent)` } : undefined}
              >
                <span className="flex justify-between">
                  <span>{d.day}</span>
                  {note && <span title="Daily note">🗒</span>}
                </span>
                {net && <span className="hidden truncate num md:block">{formatMoney(net)}</span>}
              </Link>
            );
          }),
        )}
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">Notes this month</h3>
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No daily notes. Add one from a day in the calendar.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="notes-list">
            {notes.map((n) => (
              <li key={n.date} className="rounded-md border p-3 text-sm">
                <Link
                  href={calendarHref(links, { month: monthParam, day: n.date }) as Route}
                  className="font-medium hover:underline"
                >
                  {n.date}
                </Link>
                {(n.mood || n.marketContext) && (
                  <p className="text-muted-foreground text-xs">
                    {[n.mood, n.marketContext].filter(Boolean).join(' · ')}
                  </p>
                )}
                {n.notes && <p className="mt-1 whitespace-pre-wrap">{n.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
