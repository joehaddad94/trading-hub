import type { ReactNode } from 'react';

/** The Backtest Lab is a full-height workspace; this report is a long page, so it scrolls inside it. */
export default function LiveVsBacktestLayout({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 overflow-y-auto">{children}</div>;
}
