import type { ReactNode } from 'react';
import { ModuleHeader } from '@/shell/module-header';
import { ModuleBottomTabs, ModuleSidebar } from '@/shell/module-nav';
import { getModule } from '@/shell/modules';

export default function TrackerLayout({ children }: { children: ReactNode }) {
  const mod = getModule('tracker');
  return (
    <div className="flex min-h-dvh flex-col">
      {/* The account scope selector (§8.1) mounts in the header in M6. */}
      <ModuleHeader moduleId="tracker" />
      <div className="flex flex-1">
        <ModuleSidebar items={mod.nav} rootHref={mod.href} />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
      </div>
      <ModuleBottomTabs items={mod.nav} rootHref={mod.href} />
    </div>
  );
}
