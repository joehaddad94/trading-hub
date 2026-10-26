'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';

type Action = (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;

export function RemoveUser({ email, action }: { email: string; action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} aria-label={`Remove ${email}`} className="flex items-center gap-2">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? 'Removing…' : 'Remove'}
      </Button>
      {state && !state.ok && (
        <span role="status" className={cn('text-loss text-sm')}>
          {state.error}
        </span>
      )}
    </form>
  );
}
