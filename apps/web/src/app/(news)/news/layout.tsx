import type { ReactNode } from 'react';
import { ImportOnOpen } from '@/shell/import-on-open';
import { ModuleHeader } from '@/shell/module-header';
import { ModuleSidebar, ModuleTopTabs } from '@/shell/module-nav';
import { getModule } from '@/shell/modules';
import { SyncBanner } from '@/shell/sync-banner';

export default function NewsLayout({ children }: { children: ReactNode }) {
  const mod = getModule('news');
  return (
    <div className="flex min-h-dvh flex-col">
      <ImportOnOpen />
      <ModuleHeader moduleId="news" />
      <SyncBanner />
      <ModuleTopTabs items={mod.nav} rootHref={mod.href} />
      <div className="flex flex-1">
        <ModuleSidebar items={mod.nav} rootHref={mod.href} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
