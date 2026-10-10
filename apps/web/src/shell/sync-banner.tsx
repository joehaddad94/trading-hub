import { formatBeirut } from '@/lib/format';
import { getSyncStatus } from '@/lib/server/imports';
import { StatusStrip } from './status-strip';

/** Red status line on every page while sync is unhealthy (tracker spec §7). */
export async function SyncBanner() {
  const status = await getSyncStatus();
  if (!status || status.conditions.length === 0) return null;
  return (
    <StatusStrip
      tone="error"
      title="Sync problem"
      items={status.conditions.map((c) => ({ key: c.kind, message: c.message, since: c.since }))}
      link={{ href: '/settings/imports', label: 'Open Imports & health' }}
    />
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
