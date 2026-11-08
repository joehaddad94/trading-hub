import type { Route } from 'next';
import Link from 'next/link';
import { formatBeirut } from '@/lib/format';
import { cn } from '@/lib/utils';

export type StatusItem = { key: string; message: string; since?: Date | null | undefined };

/**
 * Sync and market-data problems. On the hub: one slim line (the first problem inline, the rest open in place).
 * In a module bar: one labelled chip whose list opens under it (navbar redesign A, 8 Nov 2026), so a warning never
 * stacks rows above the page or the chart.
 */
export function StatusStrip({
  tone,
  title,
  label,
  items,
  link,
  chip = false,
}: {
  tone: 'error' | 'warning';
  title: string;
  /** The chip's short name ("Sync", "Market data"). */
  label: string;
  items: StatusItem[];
  link?: { href: Route; label: string } | undefined;
  chip?: boolean;
}) {
  const [first] = items;
  if (!first) return null;
  const more = items.length - 1;
  const dot = (
    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tone === 'error' ? 'bg-loss' : 'bg-warning')} />
  );
  const list = (
    <>
      <ul className="flex flex-col gap-1">
        {items.map((c) => (
          <li key={c.key} className="break-words">
            {c.message}
            {c.since && <span className="text-muted-foreground"> · since {formatBeirut(c.since)}</span>}
          </li>
        ))}
      </ul>
      {link && (
        <Link href={link.href} className="self-start font-medium underline underline-offset-4">
          {link.label}
        </Link>
      )}
    </>
  );
  if (chip) {
    return (
      <div role="alert" className="relative shrink-0" data-chip="true">
        <details className="group">
          <summary
            className={cn(
              'flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden',
              tone === 'error' ? 'border-loss/40 text-loss' : 'border-warning/40 text-warning',
            )}
            title={`${title}: ${first.message}`}
          >
            {dot}
            <span className="font-medium compact:sr-only">{label}</span>
            {more > 0 && <span className="num compact:hidden">+{more}</span>}
          </summary>
          <div className="absolute top-full right-0 z-50 mt-2 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground text-sm shadow-xl">
            <p className={cn('font-medium', tone === 'error' ? 'text-loss' : 'text-warning')}>{title}</p>
            {list}
          </div>
        </details>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={cn(
        'border-b px-4 text-sm',
        tone === 'error' ? 'border-loss/40 bg-loss/10' : 'border-warning/40 bg-warning/10',
      )}
    >
      <details className="group mx-auto max-w-5xl">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 [&::-webkit-details-marker]:hidden">
          {dot}
          <span className={cn('shrink-0 font-medium', tone === 'error' && 'text-loss')}>{title}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground group-open:invisible">{first.message}</span>
          <span className="shrink-0 text-muted-foreground text-xs underline underline-offset-4">
            <span className="group-open:hidden">{more > 0 ? `+${more} more` : 'Details'}</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="flex flex-col gap-1 pb-2">{list}</div>
      </details>
    </div>
  );
}
