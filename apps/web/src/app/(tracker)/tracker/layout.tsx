import { type ReactNode, Suspense } from 'react';
import { ScopeSelector } from '@/modules/tracker/components/scope-selector';
import { TRACKER_KEPT_PARAMS } from '@/modules/tracker/search-params';
import { getUnjournaledCount } from '@/modules/tracker/server/journal';
import { getScopeOptions } from '@/modules/tracker/server/scope';
import { AppShell } from '@/shell/app-shell';
import { getModule } from '@/shell/modules';

export default async function TrackerLayout({ children }: { children: ReactNode }) {
  const mod = getModule('tracker');
  const [accounts, toJournal] = await Promise.all([getScopeOptions(), getUnjournaledCount()]);
  const nav = mod.nav.map((item) => (item.href === '/tracker/journal' ? { ...item, badge: toJournal } : item));
  return (
    <AppShell
      title={mod.name}
      nav={nav}
      rootHref={mod.href}
      keep={TRACKER_KEPT_PARAMS}
      controls={
        <Suspense fallback={<div className="h-11 w-44 rounded-md border md:h-9" />}>
          <ScopeSelector accounts={accounts} />
        </Suspense>
      }
    >
      <main className="min-w-0 flex-1">{children}</main>
    </AppShell>
  );
}
