import Link from 'next/link';
import { formatBeirut } from '@/lib/format';
import { getSyncStatus } from '@/lib/server/imports';

/** Red banner on every page while sync is unhealthy (tracker spec §7). */
export async function SyncBanner() {
  const status = await getSyncStatus();
  if (!status || status.conditions.length === 0) return null;
  return (
    <div role="alert" className="border-loss border-b bg-loss/15 px-4 py-3 text-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-1">
        <p className="font-semibold text-loss">Sync problem — data may be out of date</p>
        <ul className="flex flex-col gap-1">
          {status.conditions.map((c) => (
            <li key={c.kind} className="break-words">
              {c.message}
              {c.since && <span className="text-muted-foreground"> · since {formatBeirut(c.since)}</span>}
            </li>
          ))}
        </ul>
        <Link href="/settings/imports" className="self-start font-medium underline underline-offset-4">
          Open Imports &amp; health
        </Link>
      </div>
    </div>
  );
}

/** Hub greeting line: when data last arrived. */
export async function SyncStatusLine() {
  const status = await getSyncStatus();
  if (!status) return <p className="text-muted-foreground text-sm">The database is not configured yet.</p>;
  if (!status.lastFileAt) return <p className="text-muted-foreground text-sm">No sync file imported yet.</p>;
  return (
    <p className="text-muted-foreground text-sm">
      Last sync file: {formatBeirut(status.lastFileAt)}
      {status.conditions.length > 0 ? ' · needs attention' : ''}
    </p>
  );
}
