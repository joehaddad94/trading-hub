'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { EMOTIONS, type JournalFormInput, type JournalFormValues, journalSchema } from './schema';

type Tag = { id: string; name: string; kind: 'setup' | 'mistake' | 'context' };

export type JournalDefaults = Omit<JournalFormInput, 'next'>;

/**
 * Trade journal form (§8.3 screen 6). Mobile-first: big tap targets, chips instead of free text where it can,
 * and a sticky Save / Save & next bar so a trade can be journaled in well under a minute on a phone.
 */
export function JournalForm({
  defaults,
  tags,
  side,
  openPrice,
  save,
}: {
  defaults: JournalDefaults;
  tags: Tag[];
  side: 'buy' | 'sell';
  openPrice: string;
  save: (input: JournalFormInput) => Promise<ActionResult<{ next: string | null }>>;
}) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [newMistake, setNewMistake] = useState('');
  const form = useForm<JournalFormInput, unknown, JournalFormValues>({
    resolver: zodResolver(journalSchema),
    defaultValues: { ...defaults, next: false },
  });
  const { register, control, handleSubmit, formState, getValues, setValue, watch } = form;
  const mistakeTags = tags.filter((t) => t.kind === 'mistake').map((t) => t.name);
  const mistakes = watch('mistakes') ?? [];
  const mistakeOptions = [...new Set([...mistakeTags, ...mistakes])];

  const submit = (next: boolean) =>
    handleSubmit(() => {
      setResult(null);
      startTransition(async () => {
        const res = await save({ ...getValues(), next });
        if (!res.ok) {
          setResult({ ok: false, message: res.error });
          return;
        }
        if (next && res.data.next) {
          router.push(`/tracker/trades/${res.data.next}` as Route);
          return;
        }
        setResult({ ok: true, message: next ? 'Saved. Nothing left to journal.' : 'Journal saved.' });
        router.refresh();
      });
    });

  const addMistake = () => {
    const name = newMistake.trim();
    if (!name) return;
    if (!mistakes.includes(name)) setValue('mistakes', [...mistakes, name], { shouldDirty: true });
    setNewMistake('');
  };

  return (
    <form
      aria-label="Journal"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false)(e);
      }}
    >
      <input type="hidden" {...register('tradeId')} />

      <Field label="Setup" htmlFor="setupTagId">
        <select
          id="setupTagId"
          {...register('setupTagId')}
          className="h-11 rounded-md border bg-background px-2 text-base md:h-9 md:text-sm"
        >
          <option value="">No setup</option>
          {tags
            .filter((t) => t.kind === 'setup')
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </Field>

      <Controller
        control={control}
        name="followedPlan"
        render={({ field }) => (
          <ChipGroup
            label="Followed plan?"
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
            selected={field.value ? [field.value] : []}
            onToggle={(v) => field.onChange(field.value === v ? '' : v)}
          />
        )}
      />

      <div className="grid grid-cols-3 gap-2">
        <Field
          label="Initial SL"
          htmlFor="initialSl"
          error={formState.errors.initialSl?.message}
          hint={`${side === 'buy' ? 'Below' : 'Above'} ${openPrice}`}
        >
          <Input id="initialSl" inputMode="decimal" autoComplete="off" {...register('initialSl')} />
        </Field>
        <Field label="Planned RR" htmlFor="plannedRr" error={formState.errors.plannedRr?.message}>
          <Input id="plannedRr" inputMode="decimal" autoComplete="off" {...register('plannedRr')} />
        </Field>
        <Field label="Planned risk $" htmlFor="plannedRiskUsd" error={formState.errors.plannedRiskUsd?.message}>
          <Input id="plannedRiskUsd" inputMode="decimal" autoComplete="off" {...register('plannedRiskUsd')} />
        </Field>
      </div>

      {(['emotionBefore', 'emotionAfter'] as const).map((name) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field }) => {
            const value = typeof field.value === 'string' ? field.value : '';
            const options = [...new Set([...EMOTIONS, ...(value ? [value] : [])])];
            return (
              <ChipGroup
                label={name === 'emotionBefore' ? 'Feeling before' : 'Feeling after'}
                options={options.map((o) => ({ value: o, label: o }))}
                selected={value ? [value] : []}
                onToggle={(v) => field.onChange(value === v ? '' : v)}
              />
            );
          }}
        />
      ))}

      <div className="flex flex-col gap-2">
        <ChipGroup
          label="Mistakes"
          options={mistakeOptions.map((m) => ({ value: m, label: m }))}
          selected={mistakes}
          onToggle={(v) =>
            setValue('mistakes', mistakes.includes(v) ? mistakes.filter((m) => m !== v) : [...mistakes, v], {
              shouldDirty: true,
            })
          }
          empty="No mistake tags yet."
        />
        <div className="flex gap-2">
          <Input
            aria-label="New mistake"
            placeholder="Add a mistake…"
            value={newMistake}
            maxLength={60}
            onChange={(e) => setNewMistake(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addMistake();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addMistake}>
            Add
          </Button>
        </div>
      </div>

      <Controller
        control={control}
        name="contextTagIds"
        render={({ field }) => {
          const value = field.value ?? [];
          return (
            <ChipGroup
              label="Context"
              options={tags.filter((t) => t.kind === 'context').map((t) => ({ value: t.id, label: t.name }))}
              selected={value}
              onToggle={(v) => field.onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
              empty="Add context tags in Settings."
            />
          );
        }}
      />

      <Controller
        control={control}
        name="rating"
        render={({ field }) => {
          const value = field.value === null || field.value === undefined ? '' : String(field.value);
          return (
            <ChipGroup
              label="Rating"
              options={['1', '2', '3', '4', '5'].map((r) => ({ value: r, label: `${r} ★` }))}
              selected={value ? [value] : []}
              onToggle={(v) => field.onChange(value === v ? '' : v)}
            />
          );
        }}
      />

      <Field label="Notes" htmlFor="notes" error={formState.errors.notes?.message}>
        <textarea
          id="notes"
          rows={5}
          maxLength={10_000}
          {...register('notes')}
          className="rounded-md border bg-background px-3 py-2 text-base md:text-sm"
        />
      </Field>

      <div className="sticky bottom-14 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3 md:bottom-0 md:mx-0 md:px-0">
        <Button type="submit" disabled={pending} className="h-11 md:h-9">
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-11 md:h-9"
          onClick={(e) => void submit(true)(e)}
        >
          Save &amp; next
        </Button>
        {result && (
          <p role="status" className={cn('text-sm', result.ok ? 'text-profit' : 'text-loss')}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-loss text-xs">{error}</p>}
    </div>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  empty,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  empty?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 font-medium text-sm">{label}</legend>
      {options.length === 0 && empty ? <p className="text-muted-foreground text-xs">{empty}</p> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                'h-11 rounded-full border px-3 text-sm md:h-8',
                on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
