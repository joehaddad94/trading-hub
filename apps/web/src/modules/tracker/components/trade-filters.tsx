'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ChangeEvent, type ReactNode, useEffect, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';

export type FilterChip = { key: string; label: string; href: string };

/**
 * Trades filters (audit U4). Any change applies at once (no Apply button). On a phone the fields live in a
 * bottom sheet behind a "Filters" button, and the active filters show as removable chips; on desktop the
 * fields sit inline. The fields themselves are server-rendered children; this only listens for their changes.
 */
export function TradeFilters({
  fieldsKey,
  chips,
  clearHref,
  children,
}: {
  /** Changes with the applied filters, so the uncontrolled fields reset when a chip or "Clear" removes one. */
  fieldsKey: string;
  chips: FilterChip[];
  clearHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onChange = (e: ChangeEvent<HTMLElement>) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (!el.name) return;
    const q = new URLSearchParams(searchParams.toString());
    if (el.value) q.set(el.name, el.value);
    else q.delete(el.name);
    q.delete('page');
    const s = q.toString();
    startTransition(() => router.replace(`${pathname}${s ? `?${s}` : ''}` as Route, { scroll: false }));
  };

  return (
    <div className="flex flex-col gap-2" data-pending={pending || undefined}>
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm"
          aria-expanded={open}
          aria-controls="trade-filters"
        >
          Filters
          {chips.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-primary-foreground text-xs tabular-nums">
              {chips.length}
            </span>
          )}
        </button>
        {chips.map((c) => (
          <Link
            key={c.key}
            href={c.href as Route}
            scroll={false}
            className="flex h-8 items-center gap-1 rounded-full border bg-muted px-3 text-xs"
            aria-label={`Remove filter ${c.label}`}
            data-testid="filter-chip"
          >
            {c.label}
            <span aria-hidden>×</span>
          </Link>
        ))}
      </div>
      {open && (
        <button
          type="button"
          aria-label="Close filters"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <fieldset
        id="trade-filters"
        aria-label="Filter trades"
        className={cn(
          'min-w-0 md:static md:z-auto md:block md:border-0 md:bg-transparent md:p-0',
          open
            ? 'fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-xl border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'hidden',
        )}
      >
        <div className="mb-3 flex items-center justify-between md:hidden">
          <h3 className="font-medium">Filters</h3>
          <div className="flex items-center gap-1">
            <Link href={clearHref as Route} scroll={false} className="flex h-11 items-center px-3 text-sm">
              Clear all
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
            >
              Done
            </button>
          </div>
        </div>
        <div
          key={fieldsKey}
          className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6"
          onChange={onChange}
          aria-busy={pending}
        >
          {children}
          {chips.length > 0 && (
            <div className="hidden items-end md:flex">
              <Link
                href={clearHref as Route}
                scroll={false}
                className="flex h-9 items-center px-2 text-sm underline-offset-4 hover:underline"
              >
                Clear filters
              </Link>
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}
