import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { getViewer } from '@/lib/server/viewer';
import { cn } from '@/lib/utils';
import { AccountMenu } from './account-menu';
import { HubLink, iconButton } from './app-nav';
import { ImportOnOpen } from './import-on-open';
import { ModuleHeader } from './module-header';
import type { NavItem } from './modules';
import { SyncBanner } from './sync-banner';
import { ThemeButton } from './theme/theme-toggle';

/**
 * Every screen sits in this frame. A module page gets the floating glass bar (navbar redesign A, Joe 8 Nov 2026):
 * Hub button, module chip, the module's own pages as tabs, its controls, status chips, theme and the account menu.
 * Modules are reached from the hub only, so there is no app-wide menu (Joe, 4 Nov 2026). Invited users see the
 * Backtest Lab only: no hub, no sync status, no import on open, no Settings.
 */
export async function AppShell({
  title,
  icon,
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
  /** The module's icon (the hub tile's), shown in the bar's module chip. */
  icon?: LucideIcon | undefined;
  nav?: NavItem[] | undefined;
  rootHref?: string | undefined;
  keep?: string[] | undefined;
  controls?: ReactNode;
  /** Full-height workspace (Backtest Lab): the content fills the screen instead of scrolling the page. */
  fill?: boolean;
  /** The module's own status chips (Backtest Lab's market data), shown with the sync one. */
  status?: ReactNode;
  children: ReactNode;
}) {
  const viewer = await getViewer();
  const guest = viewer?.isOwner === false;
  return (
    <div className="flex min-h-dvh">
      {!guest && <ImportOnOpen />}
      <div className={cn('flex min-w-0 flex-1 flex-col', fill && 'h-dvh')}>
        {title ? (
          <ModuleHeader
            title={title}
            icon={icon}
            nav={nav}
            rootHref={rootHref}
            keep={keep}
            leading={guest ? null : <HubLink />}
            status={
              <>
                {!guest && <SyncBanner chip />}
                {status}
              </>
            }
            trailing={
              <>
                {/* A phone Backtest bar is one row: theme stays in the account menu there. */}
                <ThemeButton className={cn(iconButton, fill && 'compact:hidden')} tooltip={false} />
                {viewer && <AccountMenu email={viewer.email} showSettings={!guest} />}
              </>
            }
            fill={fill}
          >
            {controls}
          </ModuleHeader>
        ) : (
          !guest && <SyncBanner />
        )}
        {children}
      </div>
    </div>
  );
}
