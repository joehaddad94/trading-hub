import { connection } from 'next/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBeirut } from '@/lib/format';
import { getDb } from '@/lib/server/db';
import { getInbox, getRecentAlerts, listRecentImports } from '@/lib/server/imports';
import { HealthForms, ReprocessForm, SyncNowForm, UploadForm } from './import-forms';

export const metadata = { title: 'Imports · Settings' };

export default async function ImportsPage() {
  await connection();
  const db = getDb();
  const [rows, alerts] = await Promise.all([listRecentImports(), getRecentAlerts()]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Imports &amp; health</h2>

      <Card>
        <CardHeader>
          <CardTitle>Google Drive inbox</CardTitle>
          <CardDescription>
            {getInbox() ? 'Imports run daily and when you open the app.' : 'Drive is not configured yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncNowForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync health</CardTitle>
          <CardDescription>Checks run daily and on every page load. Alerts are in-app only for now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <HealthForms />
          {alerts.length > 0 && (
            <ul className="flex flex-col divide-y text-sm">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2">
                  <span className="font-medium">
                    {a.kind} <span className="font-normal text-muted-foreground">· {formatBeirut(a.sentAt)}</span>
                  </span>
                  <span className="break-words text-muted-foreground">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual upload</CardTitle>
          <CardDescription>Fallback when the scheduled export can't reach Drive.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent files</CardTitle>
          <CardDescription>{db ? `${rows.length} shown` : 'The database is not configured.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No files imported yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all font-medium">{r.fileName}</span>
                    <ResultBadge result={r.importResult} />
                  </div>
                  <span className="text-muted-foreground">
                    Exported {r.generatedAt ? formatBeirut(r.generatedAt) : '—'} · file status {r.status ?? '—'} ·
                    imported {r.importedAt ? formatBeirut(r.importedAt) : '—'}
                  </span>
                  {r.importError && (
                    <pre className="whitespace-pre-wrap break-words text-muted-foreground text-xs">{r.importError}</pre>
                  )}
                  {r.importResult !== null && r.importResult !== 'ok' && <ReprocessForm id={r.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function ResultBadge({ result }: { result: string | null }) {
  const tone =
    result === 'ok'
      ? 'border-profit text-profit'
      : result === 'partial'
        ? 'border-warning text-warning'
        : result === null
          ? 'border-border text-muted-foreground'
          : 'border-loss text-loss';
  return <span className={`rounded-md border px-2 py-0.5 text-xs ${tone}`}>{result ?? 'pending'}</span>;
}
