import type { ReactNode } from 'react';
import { getViewer } from '@/lib/server/viewer';
import { CandleBanner } from '@/modules/backtest/components/candle-banner';
import { AppShell } from '@/shell/app-shell';
import { getModule } from '@/shell/modules';

/** Full-screen lab layout (tracker spec §8.0): the chart fills the screen on desktop and phone. */
export default async function BacktestLayout({ children }: { children: ReactNode }) {
  const mod = getModule('backtest');
  const owner = (await getViewer())?.isOwner === true;
  const nav = mod.nav.filter((item) => owner || !item.ownerOnly);
  return (
    <AppShell title={mod.name} nav={nav} rootHref={mod.href} fill icon={mod.icon} status={<CandleBanner chip />}>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </AppShell>
  );
}
