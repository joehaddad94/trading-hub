'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type ActionResult,
  reprocessAction,
  runHealthCheckAction,
  sendTestAlertAction,
  syncNow,
  uploadExport,
} from './actions';

function Result({ state }: { state: ActionResult<string> | null }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="whitespace-pre-line text-sm">
      {state.data}
    </p>
  ) : (
    <p role="alert" className="whitespace-pre-line text-destructive text-sm">
      {state.error}
    </p>
  );
}

export function SyncNowForm() {
  const [state, action, pending] = useActionState(syncNow, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Syncing…' : 'Sync now'}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadExport, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">Export file (JSON, contract v1)</Label>
        <Input id="file" name="file" type="file" accept="application/json,.json" required />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? 'Importing…' : 'Upload and import'}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function HealthForms() {
  const [check, checkAction, checking] = useActionState(runHealthCheckAction, null);
  const [test, testAction, testing] = useActionState(sendTestAlertAction, null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <form action={checkAction}>
          <Button type="submit" variant="secondary" disabled={checking}>
            {checking ? 'Checking…' : 'Run health check'}
          </Button>
        </form>
        <form action={testAction}>
          <Button type="submit" variant="outline" disabled={testing}>
            {testing ? 'Sending…' : 'Send test alert'}
          </Button>
        </form>
      </div>
      <Result state={check} />
      <Result state={test} />
    </div>
  );
}

/** One row's "Reprocess" button (tracker spec §8.3 #11). */
export function ReprocessForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reprocessAction, null);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? 'Reprocessing…' : 'Reprocess'}
      </Button>
      <Result state={state} />
    </form>
  );
}
