'use client';

import { LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { signOutAction } from '@/app/(auth)/sign-out-actions';
import { ThemeSwitch } from './theme/theme-toggle';

const item =
  'flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none md:min-h-9';

/**
 * The avatar at the end of every module bar (navbar redesign A, Joe 8 Nov 2026): who is signed in, the theme with
 * "System", Settings (owner only) and Log out, so no module has to send you back to the hub for them.
 */
export function AccountMenu({ email, showSettings }: { email: string; showSettings: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-9"
      >
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full border bg-primary/12 font-semibold text-primary text-xs uppercase"
        >
          {email.slice(0, 1)}
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute top-full right-0 z-50 mt-2 flex w-64 flex-col gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
        >
          <p className="truncate px-2.5 pt-1 pb-1.5 text-muted-foreground text-xs" title={email}>
            {email}
          </p>
          <ThemeSwitch />
          <div className="my-1 border-t" />
          {showSettings && (
            <Link href="/settings" className={item} onClick={() => setOpen(false)}>
              <Settings className="size-4 text-muted-foreground" aria-hidden strokeWidth={1.8} />
              Settings
            </Link>
          )}
          <form action={signOutAction} className="contents">
            <button type="submit" className={item}>
              <LogOut className="size-4 text-muted-foreground" aria-hidden strokeWidth={1.8} />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
