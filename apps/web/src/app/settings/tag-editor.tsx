'use client';

import { useActionState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';

type Tag = { id: string; name: string; kind: 'setup' | 'mistake' | 'context' };
type Action = (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;

const KINDS = [
  { kind: 'setup', label: 'Setups' },
  { kind: 'context', label: 'Context' },
  { kind: 'mistake', label: 'Mistakes' },
] as const;

/** Journal tag management (§8.3 screen 12): add, rename, delete per kind. */
export function TagEditor({ tags, create, edit }: { tags: Tag[]; create: Action; edit: Action }) {
  return (
    <div className="flex flex-col gap-5">
      {KINDS.map(({ kind, label }) => (
        <div key={kind} className="flex flex-col gap-2">
          <h4 className="font-medium text-sm">{label}</h4>
          <ul className="flex flex-col gap-2">
            {tags
              .filter((t) => t.kind === kind)
              .map((t) => (
                <TagRow key={t.id} tag={t} edit={edit} />
              ))}
          </ul>
          <ActionForm action={create} submit="Add" label={`Add ${label.toLowerCase()} tag`} className="gap-2">
            <input type="hidden" name="kind" value={kind} />
            <Input name="name" aria-label={`New ${kind} tag`} placeholder={`New ${kind} tag`} maxLength={60} />
          </ActionForm>
        </div>
      ))}
    </div>
  );
}

function TagRow({ tag, edit }: { tag: Tag; edit: Action }) {
  const [state, action, pending] = useActionState(edit, null);
  return (
    <li>
      <form action={action} className="flex flex-wrap items-center gap-2" aria-label={`Tag ${tag.name}`}>
        <input type="hidden" name="id" value={tag.id} />
        <Input name="name" defaultValue={tag.name} aria-label="Tag name" maxLength={60} className="w-48" />
        <Button type="submit" name="intent" value="rename" size="sm" variant="outline" disabled={pending}>
          Rename
        </Button>
        <Button type="submit" name="intent" value="delete" size="sm" variant="ghost" disabled={pending}>
          Delete
        </Button>
        {state && (
          <span role="status" className={cn('text-sm', state.ok ? 'text-profit' : 'text-loss')}>
            {state.ok ? state.data : state.error}
          </span>
        )}
      </form>
    </li>
  );
}
