import type { ReactNode } from 'react';
import { getViewer } from '@/lib/server/viewer';
import { cn } from '@/lib/utils';
import { AccountActions, HubLink } from './app-nav';
import { ImportOnOpen } from './import-on-open';
import { ModuleHeader } from './module-header';
import type { NavItem } from './modules';
import { SyncBanner } from './sync-banner';

/**
 * Every screen sits in this frame: an optional module header (Hub button, title, the module's own pages as tabs)
 * and the sync status line. Modules are reached from the hub only, so there is no app-wide menu (Joe, 4 Nov 2026).
 * Invited users see the Backtest Lab only: no hub, no sync status, no import on open; their header carries theme
 * and Log out instead of the Hub button.
 */
export async function AppShell({
  title,
  nav,
  rootHref,
  keep,
  controls,
  fill = false,
  status,
  children,
}: {
  /** Module title for the header; omit for a page that draws its own header (the hub). */
  title?: string | undefined;
  nav?: NavItem[] | undefined;
  rootHref?: string | undefined;
  keep?: string[] | undefined;
  controls?: ReactNode;
  /** Full-height workspace (Backtest Lab): the content fills the screen instead of scrolling the page. */
  fill?: boolean;
  /** The module's own status lines (Backtest Lab's market data), shown with the sync one. */
  status?: ReactNode;
  children: ReactNode;
}) {
  const guest = (await getViewer())?.isOwner === false;
  return (
    <div className="flex min-h-dvh">
      {!guest && <ImportOnOpen />}
      <div className={cn('flex min-w-0 flex-1 flex-col', fill && 'h-dvh')}>
        {title && (
          <ModuleHeader
            title={title}
            nav={nav}
            rootHref={rootHref}
            keep={keep}
            leading={guest ? null : <HubLink />}
            trailing={guest ? <AccountActions guest /> : null}
            dockedStatus={fill}
          >
            {controls}
          </ModuleHeader>
        )}
        {/* A full-height workspace on a phone docks the status lines as dots in the header's corner. */}
        <div
          className={cn(
            fill && 'compact:fixed compact:top-1.5 compact:right-2 compact:z-30 compact:flex compact:gap-1',
          )}
        >
          {!guest && <SyncBanner dock={fill} />}
          {status}
        </div>
        {children}
      </div>
    </div>
  );
}
