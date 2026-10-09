'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/action-result';

type Note = { notes: string | null; mood: string | null; marketContext: string | null } | null;

/** Daily note, created or edited inline in the day view (§8.2). */
export function DailyNoteForm({
  date,
  note,
  save,
}: {
  date: string;
  note: Note;
  save: (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;
}) {
  const [state, action, pending] = useActionState(save, null);
  return (
    <form action={action} className="flex flex-col gap-3" aria-label="Daily note">
      <input type="hidden" name="date" value={date} />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`mood-${date}`}>Mood</Label>
          <Input id={`mood-${date}`} name="mood" defaultValue={note?.mood ?? ''} maxLength={100} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`context-${date}`}>Market context</Label>
          <Input
            id={`context-${date}`}
            name="marketContext"
            defaultValue={note?.marketContext ?? ''}
            maxLength={1000}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`notes-${date}`}>Notes</Label>
        <textarea
          id={`notes-${date}`}
          name="notes"
          defaultValue={note?.notes ?? ''}
          maxLength={5000}
          rows={4}
          className="rounded-md border bg-background px-3 py-2 text-base md:text-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save note'}
        </Button>
        {state && (
          <p role="status" className={state.ok ? 'text-emerald-400 text-sm' : 'text-red-400 text-sm'}>
            {state.ok ? state.data : state.error}
          </p>
        )}
      </div>
    </form>
  );
}
