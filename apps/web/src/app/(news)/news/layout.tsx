import type { ReactNode } from 'react';
import { ModuleHeader } from '@/shell/module-header';
import { ModuleSidebar, ModuleTopTabs } from '@/shell/module-nav';
import { getModule } from '@/shell/modules';

export default function NewsLayout({ children }: { children: ReactNode }) {
  const mod = getModule('news');
  return (
    <div className="flex min-h-dvh flex-col">
      <ModuleHeader moduleId="news" />
      <ModuleTopTabs items={mod.nav} rootHref={mod.href} />
      <div className="flex flex-1">
        <ModuleSidebar items={mod.nav} rootHref={mod.href} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
