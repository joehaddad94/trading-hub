import { formatBeirut } from '@/lib/format';
import { getSyncStatus } from '@/lib/server/imports';
import { StatusStrip } from './status-strip';

/**
 * Status line on every page while sync is unhealthy (tracker spec §7): red for real problems, amber when the
 * only issue is a known partial export (data arrived, e.g. next week's calendar isn't published yet).
 */
export async function SyncBanner() {
  const status = await getSyncStatus();
  if (!status || status.conditions.length === 0) return null;
  const error = status.conditions.some((c) => c.severity === 'error');
  return (
    <StatusStrip
      tone={error ? 'error' : 'warning'}
      title={error ? 'Sync problem' : 'Sync partial'}
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
      {status.conditions.some((c) => c.severity === 'error')
        ? ' · needs attention'
        : status.conditions.length > 0
          ? ' · partial'
          : ''}
    </p>
  );
}
