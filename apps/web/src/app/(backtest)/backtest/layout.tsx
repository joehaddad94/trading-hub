import type { ReactNode } from 'react';
import { CandleBanner } from '@/modules/backtest/components/candle-banner';
import { ImportOnOpen } from '@/shell/import-on-open';
import { ModuleHeader } from '@/shell/module-header';
import { SyncBanner } from '@/shell/sync-banner';

/** Full-screen lab layout: no module sidebar (tracker spec §8.0). */
export default function BacktestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <ImportOnOpen />
      <ModuleHeader moduleId="backtest" />
      <SyncBanner />
      <CandleBanner />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
