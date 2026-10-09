'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/action-result';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const BUCKET = 'journal-screenshots';

type Shot = { id: string; url: string | null; caption: string | null };
type FormAction = (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;

/** Trade screenshots: private bucket, shown through short-lived signed URLs; uploads go straight to Storage. */
export function Screenshots({
  tradeId,
  shots,
  enabled,
  startUpload,
  finishUpload,
  remove,
}: {
  tradeId: string;
  shots: Shot[];
  enabled: boolean;
  startUpload: (input: {
    tradeId: string;
    type: string;
    size: number;
  }) => Promise<ActionResult<{ path: string; token: string }>>;
  finishUpload: (input: { tradeId: string; path: string; caption: string }) => Promise<ActionResult<string>>;
  remove: FormAction;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [removed, removeAction] = useActionState(remove, null);

  const upload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus({ ok: false, message: 'Choose an image.' });
      return;
    }
    startTransition(async () => {
      setStatus(null);
      const started = await startUpload({ tradeId, type: file.type, size: file.size });
      if (!started.ok) return setStatus({ ok: false, message: started.error });
      const { error } = await createSupabaseBrowserClient()
        .storage.from(BUCKET)
        .uploadToSignedUrl(started.data.path, started.data.token, file, { contentType: file.type });
      if (error) return setStatus({ ok: false, message: 'Uploading failed; try again.' });
      const done = await finishUpload({ tradeId, path: started.data.path, caption });
      if (!done.ok) return setStatus({ ok: false, message: done.error });
      setStatus({ ok: true, message: done.data });
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    });
  };

  return (
    <section aria-label="Screenshots" className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Screenshots</h3>
      {shots.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {shots.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 rounded-md border p-1 text-xs">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {/* Signed URLs expire; next/image would cache them. */}
                  {/* biome-ignore lint/performance/noImgElement: short-lived signed URL */}
                  <img src={s.url} alt={s.caption ?? 'Trade screenshot'} className="aspect-video w-full object-cover" />
                </a>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
                  Unavailable
                </div>
              )}
              <div className="flex items-center justify-between gap-1">
                <span className="truncate">{s.caption ?? ''}</span>
                <form action={removeAction}>
                  <input type="hidden" name="tradeId" value={tradeId} />
                  <input type="hidden" name="screenshotId" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label="Remove screenshot">
                    Remove
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {removed && !removed.ok && <p className="text-loss text-sm">{removed.error}</p>}
      {enabled ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Screenshot image"
            className="text-sm"
          />
          <Input
            aria-label="Caption"
            placeholder="Caption (optional)"
            value={caption}
            maxLength={200}
            onChange={(e) => setCaption(e.target.value)}
          />
          <Button type="button" variant="outline" disabled={pending} onClick={upload} className="h-11 md:h-9">
            {pending ? 'Uploading…' : 'Add screenshot'}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Screenshots need the Supabase service-role key on the server.</p>
      )}
      {status && (
        <p role="status" className={cn('text-sm', status.ok ? 'text-profit' : 'text-loss')}>
          {status.message}
        </p>
      )}
    </section>
  );
}
