import { type ReactNode, Suspense } from 'react';
import { ScopeSelector } from '@/modules/tracker/components/scope-selector';
import { TRACKER_KEPT_PARAMS } from '@/modules/tracker/search-params';
import { getScopeOptions } from '@/modules/tracker/server/scope';
import { ImportOnOpen } from '@/shell/import-on-open';
import { ModuleHeader } from '@/shell/module-header';
import { ModuleBottomTabs, ModuleSidebar } from '@/shell/module-nav';
import { getModule } from '@/shell/modules';
import { SyncBanner } from '@/shell/sync-banner';

export default async function TrackerLayout({ children }: { children: ReactNode }) {
  const mod = getModule('tracker');
  const accounts = await getScopeOptions();
  return (
    <div className="flex min-h-dvh flex-col">
      <ImportOnOpen />
      <ModuleHeader moduleId="tracker">
        <Suspense fallback={<div className="h-11 w-44 rounded-md border md:h-9" />}>
          <ScopeSelector accounts={accounts} />
        </Suspense>
      </ModuleHeader>
      <SyncBanner />
      <div className="flex flex-1">
        <ModuleSidebar items={mod.nav} rootHref={mod.href} keep={TRACKER_KEPT_PARAMS} />
        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
      </div>
      <ModuleBottomTabs items={mod.nav} rootHref={mod.href} keep={TRACKER_KEPT_PARAMS} />
    </div>
  );
}
