import type { ReactNode } from 'react';
import { ImportOnOpen } from '@/shell/import-on-open';
import { ModuleHeader } from '@/shell/module-header';

/** Full-screen lab layout: no module sidebar (tracker spec §8.0). */
export default function BacktestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <ImportOnOpen />
      <ModuleHeader moduleId="backtest" />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
