'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type ActionResult, syncNow, uploadExport } from './actions';

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
