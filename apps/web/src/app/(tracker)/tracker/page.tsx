import type { SearchParams } from 'nuqs/server';
import { EquityCurve } from '@/components/equity-curve';
import { TrackerCalendar } from '@/modules/tracker/calendar/tracker-calendar';
import { OverviewStats } from '@/modules/tracker/components/overview-stats';
import { ScopeNotice } from '@/modules/tracker/components/scope-notice';
import { accountLabel } from '@/modules/tracker/scope-label';
import { getCalendarMonth, readCalendarParams } from '@/modules/tracker/server/calendar';
import { getOverview } from '@/modules/tracker/server/overview';
import { getPageScope } from '@/modules/tracker/server/scope';
import { SyncStatusLine } from '@/shell/sync-banner';

/** Tracker Overview (§8.3 screen 1): calendar, combined equity curve, headline stats, all scoped. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getPageScope(searchParams);
  if (!scope) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const params = await readCalendarParams(searchParams);
  const [data, month] = await Promise.all([getOverview(scope), getCalendarMonth(scope, params.year, params.month)]);
  if (!data || !month) return null;
  const labelOf = new Map(scope.accounts.map((a) => [a.id, accountLabel(a)]));
  const points = data.equity.map((p, i) => ({
    i,
    t: p.at.getTime(),
    equity: p.equity.toNumber(),
    pnl: p.equity.minus(data.equity[i - 1]?.equity ?? 0).toNumber(),
    account: labelOf.get(p.accountId) ?? '',
  }));
  const boundaryIndex = new Map(data.equity.map((p, i) => [`${p.at.getTime()}|${p.accountId}`, i]));
  const boundaries = data.boundaries.map((b) => ({
    i: boundaryIndex.get(`${b.at.getTime()}|${b.accountId}`) ?? 0,
    account: String(scope.accounts.find((a) => a.id === b.accountId)?.login ?? ''),
  }));
  const scopeParam = (await searchParams).scope?.toString() ?? 'all';

  return (
    <div className="flex flex-col gap-4 p-2 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-2 md:px-0">
        <h2 className="font-semibold text-xl">Overview</h2>
        <SyncStatusLine />
      </div>
      <ScopeNotice scope={scope} />
      <OverviewStats data={data} scope={scope} />
      <section className="rounded-lg border p-4">
        <h3 className="mb-2 font-medium">Combined equity</h3>
        <EquityCurve points={points} boundaries={boundaries} />
      </section>
      <section className="rounded-lg border p-2 md:p-4">
        <TrackerCalendar
          data={month}
          accounts={scope.accounts}
          links={{ base: '/tracker/calendar', scope: scopeParam, cell: params.cell }}
          selectedDay={null}
          today={params.today}
        />
      </section>
    </div>
  );
}
