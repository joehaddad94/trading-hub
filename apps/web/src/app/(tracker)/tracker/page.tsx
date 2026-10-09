import type { SearchParams } from 'nuqs/server';
import { ScopeNotice } from '@/modules/tracker/components/scope-notice';
import { ScopeStats } from '@/modules/tracker/components/scope-stats';
import { getScopeTrades } from '@/modules/tracker/server/scope';

/** Overview. Headline stats for the current scope now; the full screen (§8.3) arrives in M8. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const data = await getScopeTrades(searchParams);
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Overview</h2>
      {data ? (
        <>
          <ScopeNotice scope={data.scope} />
          <ScopeStats scope={data.scope} trades={data.trades} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Database not configured.</p>
      )}
    </div>
  );
}
