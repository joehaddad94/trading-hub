import type { ReactNode } from 'react';
import { CandleBanner } from '@/modules/backtest/components/candle-banner';
import { AppShell } from '@/shell/app-shell';
import { getModule } from '@/shell/modules';

/** Full-screen lab layout (tracker spec §8.0): the chart fills the screen on desktop. */
export default function BacktestLayout({ children }: { children: ReactNode }) {
  const mod = getModule('backtest');
  return (
    <AppShell title={mod.name} nav={mod.nav} rootHref={mod.href} fill>
      <CandleBanner />
      <main className="flex min-h-0 flex-1 flex-col md:overflow-hidden">{children}</main>
    </AppShell>
  );
}
