import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getUnjournaledCount } from '@/modules/tracker/server/journal';
import { AppBottomBar, AppRail } from './app-nav';
import { ImportOnOpen } from './import-on-open';
import { ModuleHeader } from './module-header';
import type { NavItem } from './modules';
import { SyncBanner } from './sync-banner';

/**
 * Every screen sits in this frame (design spec): icon rail on desktop, bottom tab bar on phone, an optional
 * module header with the module's pages as tabs, and the sync status line.
 */
export async function AppShell({
  title,
  nav,
  rootHref,
  keep,
  controls,
  fill = false,
  children,
}: {
  /** Module title for the header; omit for a page that draws its own header (the hub). */
  title?: string | undefined;
  nav?: NavItem[] | undefined;
  rootHref?: string | undefined;
  keep?: string[] | undefined;
  controls?: ReactNode;
  /** Full-height workspace (Backtest Lab): the content fills the screen on desktop instead of scrolling. */
  fill?: boolean;
  children: ReactNode;
}) {
  const toJournal = await getUnjournaledCount().catch(() => 0);
  return (
    <div className="flex min-h-dvh">
      <ImportOnOpen />
      <AppRail journalBadge={toJournal} />
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0',
          fill && 'md:h-dvh',
        )}
      >
        {title && (
          <ModuleHeader title={title} nav={nav} rootHref={rootHref} keep={keep}>
            {controls}
          </ModuleHeader>
        )}
        <SyncBanner />
        {children}
      </div>
      <AppBottomBar journalBadge={toJournal} />
    </div>
  );
}
