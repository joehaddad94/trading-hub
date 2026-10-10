'use client';

import { type ReactNode, useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';

/** A form bound to a Server Action returning ActionResult, with the result shown next to the button. */
export function ActionForm({
  action,
  submit,
  label,
  className,
  children,
}: {
  action: (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;
  submit: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} aria-label={label} className={cn('flex flex-col gap-3', className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Saving…' : submit}
        </Button>
        {state && (
          <p role="status" className={cn('text-sm', state.ok ? 'text-profit' : 'text-loss')}>
            {state.ok ? state.data : state.error}
          </p>
        )}
      </div>
    </form>
  );
}
