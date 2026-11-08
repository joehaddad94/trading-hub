import { House, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { signOutAction } from '@/app/(auth)/sign-out-actions';
import { cn } from '@/lib/utils';
import { ThemeButton } from './theme/theme-toggle';

/**
 * Navigation between modules goes through the hub only (Joe, 4 Nov 2026: "separate features into a hub like it
 * was before"). A module header carries a Hub button and the module's own pages, never links to other modules.
 */
export const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-9';

/** Back to the hub: a house, the first thing in every module bar. */
export function HubLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Back to hub"
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-9',
        className,
      )}
    >
      <House className="size-5 md:size-[1.125rem]" aria-hidden strokeWidth={1.8} />
    </Link>
  );
}

/** Log out, as a form so it works before the page has hydrated. */
function LogOutButton() {
  return (
    <form action={signOutAction} className="contents">
      <button type="submit" className={iconButton} title="Log out">
        <LogOut className="size-5 md:size-4" aria-hidden strokeWidth={1.8} />
        <span className="sr-only">Log out</span>
      </button>
    </form>
  );
}

/**
 * Theme, Settings and Log out as a row of icon buttons: on the hub for the owner, in the Backtest Lab header for an
 * invited user (who has no hub and no Settings).
 */
export function AccountActions({ guest = false, className }: { guest?: boolean; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      <ThemeButton className={iconButton} tooltip={false} />
      {!guest && (
        <Link href="/settings" className={iconButton} title="Settings">
          <Settings className="size-5 md:size-4" aria-hidden strokeWidth={1.8} />
          <span className="sr-only">Settings</span>
        </Link>
      )}
      <LogOutButton />
    </div>
  );
}
