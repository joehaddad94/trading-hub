import { cn } from '@/lib/utils';
import { accountLabel } from '../scope-label';

/** §5.1 badge colours. */
const STATUS_STYLES: Record<string, string> = {
  active: 'bg-primary/15 text-primary',
  passed: 'bg-profit/15 text-profit',
  breached: 'bg-loss/15 text-loss',
  merged: 'bg-muted text-muted-foreground',
  paused: 'bg-warning/15 text-warning',
  closed_other: 'bg-muted text-muted-foreground',
  missing: 'border border-warning text-warning',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded px-1.5 font-medium text-[11px] capitalize',
        STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/** `7002880 · Funded [Active]` — how every trade shows its account (§8.1). */
export function AccountBadge({
  account,
  colour,
}: {
  account: { login: number; phase: string; status: string };
  colour?: string | undefined;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {colour && <span className="size-2 rounded-full" style={{ backgroundColor: colour }} aria-hidden />}
      <span className="num">{accountLabel(account)}</span>
      <StatusBadge status={account.status} />
    </span>
  );
}
