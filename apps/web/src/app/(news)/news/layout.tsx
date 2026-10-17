import type { ReactNode } from 'react';
import { AppShell } from '@/shell/app-shell';
import { getModule } from '@/shell/modules';

export default function NewsLayout({ children }: { children: ReactNode }) {
  const mod = getModule('news');
  return (
    <AppShell title={mod.name} nav={mod.nav} rootHref={mod.href}>
      <main className="min-w-0 flex-1">{children}</main>
    </AppShell>
  );
}
