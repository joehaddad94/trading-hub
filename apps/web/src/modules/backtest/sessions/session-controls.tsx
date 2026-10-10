import type { SessionView } from '@trading/backtest';
import { ActionForm } from '@/components/action-form';
import type { ActionResult } from '@/lib/action-result';

type Action = (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;

/** Complete / reopen, and delete behind a disclosure (spec §6.4: backtest data only). */
export function SessionControls({
  session,
  statusAction,
  deleteAction,
}: {
  session: SessionView;
  statusAction: Action;
  deleteAction: Action;
}) {
  const completed = session.status === 'completed';
  return (
    <div className="flex flex-wrap items-start gap-4">
      <ActionForm
        action={statusAction}
        submit={completed ? 'Reopen session' : 'Complete session'}
        label={completed ? 'Reopen session' : 'Complete session'}
      >
        <input type="hidden" name="id" value={session.id} />
        <input type="hidden" name="status" value={completed ? 'in_progress' : 'completed'} />
      </ActionForm>
      <details className="rounded-md border px-3 py-2 text-sm">
        <summary className="cursor-pointer text-loss">Delete session…</summary>
        <p className="my-2 max-w-sm text-muted-foreground text-xs">
          Deletes this session&apos;s trades, orders, journal entries and drawings. Live trades are never touched.
        </p>
        <ActionForm action={deleteAction} submit="Delete for good" label="Delete session">
          <input type="hidden" name="id" value={session.id} />
          <input type="hidden" name="confirm" value="delete" />
        </ActionForm>
      </details>
    </div>
  );
}
