import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ModuleTabs } from './module-nav';
import type { NavItem } from './modules';

/**
 * The module bar (navbar redesign A, Joe 8 Nov 2026): a frosted glass bar floating off the screen edges by the same
 * gap on every side (top, sides and bottom; Joe 8 Nov: "the paddings are not matching"), like
 * the hub's tiles. Hub button, the module chip (icon + name), the module's pages as pill tabs, then the module's
 * controls, status chips, theme and account menu.
 *
 * On a phone the pages get their own row under the identity row, except in a full-height workspace (Backtest Lab),
 * which keeps one row so the chart keeps its height. A module with controls (Tracker's scope) shows them in place
 * of its name on a phone; the chip's icon still says where you are.
 */
export function ModuleHeader({
  title,
  icon: Icon,
  nav,
  rootHref,
  keep,
  leading,
  status,
  trailing,
  fill = false,
  children,
}: {
  title: string;
  icon?: LucideIcon | undefined;
  nav?: NavItem[] | undefined;
  rootHref?: string | undefined;
  keep?: string[] | undefined;
  /** Before the module chip: the Hub button. */
  leading?: ReactNode;
  /** Status chips (sync, market data), before the account buttons. */
  status?: ReactNode;
  /** At the end: theme and the account menu. */
  trailing?: ReactNode;
  /** Full-height workspace (Backtest Lab): one row on a phone too. */
  fill?: boolean;
  children?: ReactNode;
}) {
  const tabs = nav && nav.length > 1;
  const hideTitleOnPhone = Boolean(children) || (fill && tabs);
  return (
    <header className="sticky top-0 z-20 shrink-0 p-1.5 roomy:p-2.5">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 rounded-xl border bg-chrome p-1 backdrop-blur-xl roomy:flex-nowrap roomy:gap-1.5',
          'shadow-[inset_0_1px_0_var(--glass-edge),0_10px_30px_-12px_var(--glass-shadow)]',
          fill && 'flex-nowrap',
        )}
      >
        {leading && (
          <>
            {leading}
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
          </>
        )}
        <h1
          className={cn(
            'flex h-11 shrink-0 items-center gap-2 font-semibold text-[0.9375rem] tracking-tight roomy:h-9 roomy:pr-1.5 roomy:pl-1',
            leading ? 'pl-1' : 'pl-2',
            fill && tabs && 'compact:hidden',
          )}
        >
          {Icon && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Icon className="size-4" aria-hidden strokeWidth={1.9} />
            </span>
          )}
          <span className={cn(hideTitleOnPhone && 'compact:sr-only')}>{title}</span>
        </h1>
        {tabs && (
          <ModuleTabs
            items={nav}
            rootHref={rootHref ?? nav[0]?.href ?? '/'}
            keep={keep}
            className={cn(
              'min-w-0 roomy:mx-auto',
              fill ? 'flex-1 roomy:flex-none' : 'compact:order-last compact:basis-full',
            )}
          />
        )}
        <div className={cn('ml-auto flex min-w-0 items-center gap-1', children && 'compact:flex-1')}>
          {children && <div className="flex min-w-0 items-center compact:flex-1 roomy:mr-1">{children}</div>}
          {status}
          {trailing}
        </div>
      </div>
    </header>
  );
}
