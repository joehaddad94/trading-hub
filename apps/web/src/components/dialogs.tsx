'use client';

import { AlertTriangle, Info } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/*
 * The app's only alert/confirm/prompt. Browser dialogs are banned (Biome noAlert): they block the page,
 * can't be styled and look broken on phones. These are promise-based like the originals:
 *   if (await dialogs.confirm({ title: 'Delete?', tone: 'destructive' })) …
 * Built on <dialog>.showModal(), so the browser gives us the top layer (above glass cards, the nav rail
 * and a full-screen chart), focus trapping, Escape to cancel and an inert page behind.
 */

type Tone = 'default' | 'destructive';

type Common = {
  title: string;
  message?: ReactNode;
  /** Label of the main button. */
  confirmLabel?: string;
  /** 'destructive' paints the main button rose and focuses Cancel, so a stray Enter deletes nothing. */
  tone?: Tone;
};
export type AlertOptions = Common;
export type ConfirmOptions = Common & { cancelLabel?: string };
export type PromptOptions = ConfirmOptions & {
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
  /** Return an error message to keep the dialog open, or null when the value is fine. */
  validate?: (value: string) => string | null;
};

type Request =
  | { id: number; kind: 'alert'; options: AlertOptions; resolve: (value: undefined) => void }
  | { id: number; kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

export type Dialogs = {
  alert: (options: AlertOptions) => Promise<void>;
  /** Resolves true on the main button, false on Cancel, Escape or a backdrop click. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves the entered text, or null when cancelled. */
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const DialogsContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const dialogs = useContext(DialogsContext);
  if (!dialogs) throw new Error('useDialogs needs <DialogProvider> (mounted in the root layout).');
  return dialogs;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  // Requests queue up and show one at a time, like the browser's own dialogs.
  const [queue, setQueue] = useState<Request[]>([]);
  const nextId = useRef(0);

  const dialogs = useMemo<Dialogs>(() => {
    const open = <T,>(kind: Request['kind'], options: Request['options']) =>
      new Promise<T>((resolve) => {
        nextId.current += 1;
        const request = { id: nextId.current, kind, options, resolve } as Request;
        setQueue((q) => [...q, request]);
      });
    return {
      alert: (options) => open<void>('alert', options),
      confirm: (options) => open<boolean>('confirm', options),
      prompt: (options) => open<string | null>('prompt', options),
    };
  }, []);

  const settle = useCallback((request: Request, value: unknown) => {
    (request.resolve as (v: unknown) => void)(value);
    setQueue((q) => q.filter((r) => r.id !== request.id));
  }, []);

  const current = queue[0];
  return (
    <DialogsContext.Provider value={dialogs}>
      {children}
      {current && <Modal key={current.id} request={current} settle={settle} />}
    </DialogsContext.Provider>
  );
}

function Modal({ request, settle }: { request: Request; settle: (request: Request, value: unknown) => void }) {
  const { kind, options } = request;
  const destructive = options.tone === 'destructive';
  const prompt = kind === 'prompt' ? request.options : null;
  const cancelValue = kind === 'confirm' ? false : kind === 'prompt' ? null : undefined;

  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(prompt?.defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const messageId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    dialog.showModal();
    if (inputRef.current) inputRef.current.select();
    else (destructive && cancelRef.current ? cancelRef.current : confirmRef.current)?.focus();
    return () => {
      if (dialog.open) dialog.close();
      // The opener (e.g. a row's Delete button) may be gone by now; then focus just stays on the page.
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [destructive]);

  const cancel = () => settle(request, cancelValue);
  const submit = () => {
    if (kind === 'confirm') return settle(request, true);
    if (kind === 'alert') return settle(request, undefined);
    const problem = request.options.validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    settle(request, value);
  };

  const Icon = destructive ? AlertTriangle : Info;
  return (
    <dialog
      ref={ref}
      role={destructive || kind === 'alert' ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={options.message ? messageId : undefined}
      data-testid="app-dialog"
      className={cn(
        // Phone: a bottom sheet above the home indicator. Desktop: a centred card.
        'm-0 mt-auto w-full max-w-none rounded-t-2xl border border-b-0 border-border bg-popover/95 p-0 text-popover-foreground shadow-2xl backdrop-blur-xl',
        'pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in slide-in-from-bottom-4 duration-200',
        'md:m-auto md:max-w-md md:rounded-xl md:border-b md:pb-0 md:zoom-in-95 md:slide-in-from-bottom-0',
        'backdrop:bg-black/55 backdrop:backdrop-blur-[2px]',
      )}
      // Escape: the browser fires `cancel`; we settle and unmount instead of letting it close by itself.
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      // A click on the backdrop lands on the <dialog> itself, outside the inner panel.
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      // The backtest chart listens for keys on window; nothing typed here should step the replay.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <form
        className="grid gap-4 p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mx-auto -mt-2 h-1 w-9 rounded-full bg-input md:hidden" aria-hidden />
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full',
              destructive ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary',
            )}
            aria-hidden
          >
            <Icon className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div className="grid min-w-0 gap-1 pt-1">
            <h2 id={titleId} className="font-semibold text-base leading-tight">
              {options.title}
            </h2>
            {options.message && (
              <div id={messageId} className="text-muted-foreground text-sm leading-relaxed">
                {options.message}
              </div>
            )}
          </div>
        </div>

        {prompt && (
          <div className="grid gap-1.5">
            <label htmlFor={`${titleId}-input`} className="font-medium text-sm">
              {prompt.label}
            </label>
            <Input
              ref={inputRef}
              id={`${titleId}-input`}
              value={value}
              placeholder={prompt.placeholder}
              inputMode={prompt.inputMode}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
            />
            {error && (
              <p id={errorId} className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          {kind !== 'alert' && (
            <Button ref={cancelRef} type="button" variant="outline" className="md:h-9" onClick={cancel}>
              {('cancelLabel' in options && options.cancelLabel) || 'Cancel'}
            </Button>
          )}
          <Button ref={confirmRef} type="submit" variant={destructive ? 'destructive' : 'default'} className="md:h-9">
            {options.confirmLabel ?? 'OK'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
