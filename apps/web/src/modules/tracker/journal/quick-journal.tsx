'use client';

import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/action-result';
import { formatBeirut, formatMoney } from '@/lib/format';
import { formatPrice } from '@/lib/symbols';
import { cn } from '@/lib/utils';
import { type QuickJournalInput, stopSideError } from './schema';

export type QuickJournalItem = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: string;
  openPrice: string;
  closedAt: Date;
  netProfit: string;
  account: string;
};

const SWIPE_PX = 60;

/**
 * Quick journal (audit U6): one unjournaled trade per card with the three answers that matter most (followed
 * plan, setup, initial SL). Save moves to the next card; Skip (or a swipe left) leaves it for later. Phone-first.
 */
export function QuickJournal({
  items,
  total,
  setups,
  save,
}: {
  items: QuickJournalItem[];
  total: number;
  setups: { id: string; name: string }[];
  save: (input: QuickJournalInput) => Promise<ActionResult<null>>;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(0);
  const [plan, setPlan] = useState<'yes' | 'no' | ''>('');
  const [setup, setSetup] = useState('');
  const [sl, setSl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const touchX = useRef<number | null>(null);
  const t = items[index];

  const go = (to: number) => {
    setIndex(to);
    setPlan('');
    setSetup('');
    setSl('');
    setError(null);
  };

  if (!t) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-lg border p-4" data-testid="quick-journal-done">
        <p className="font-medium">
          {saved > 0 ? `${saved} journaled.` : 'Nothing left in this batch.'}{' '}
          {total - saved > 0 ? `${total - saved} still to journal.` : 'Everything in scope is journaled.'}
        </p>
        <div className="flex gap-2">
          {index > 0 && (
            <Button variant="outline" onClick={() => go(0)}>
              Back to skipped
            </Button>
          )}
          <Link href={'/tracker/journal' as Route} className="flex h-11 items-center px-3 text-sm md:h-9">
            Done
          </Link>
        </div>
      </section>
    );
  }

  const slError = sl.trim() && /^\d+(\.\d+)?$/.test(sl.trim()) ? stopSideError(t.side, t.openPrice, sl.trim()) : null;
  const net = new Decimal(t.netProfit);
  const entry = formatPrice(t.openPrice);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await save({ tradeId: t.id, followedPlan: plan, setupTagId: setup, initialSl: sl });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved((n) => n + 1);
      go(index + 1);
      if (index + 1 >= items.length) router.refresh();
    });
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border p-4 md:max-w-md"
      aria-label="Quick journal"
      data-testid="quick-journal"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || pending) return;
        if (start - end > SWIPE_PX) go(index + 1);
        else if (end - start > SWIPE_PX && index > 0) go(index - 1);
      }}
    >
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span data-testid="quick-journal-progress">
          {index + 1} of {items.length}
          {total > items.length ? ` (newest of ${total})` : ''}
        </span>
        {saved > 0 && <span className="text-profit">{saved} saved</span>}
      </div>

      <div className="flex items-start justify-between gap-2">
        <Link href={`/tracker/trades/${t.id}` as Route} className="min-w-0 hover:underline">
          <span className="font-semibold text-lg">
            {t.symbol} <span className="capitalize">{t.side}</span> · {t.lots}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {t.account} · {formatBeirut(t.closedAt, 'EEE d MMM HH:mm')}
          </span>
          <span className="block text-muted-foreground text-xs tabular-nums">Entry {entry}</span>
        </Link>
        <span
          className={cn('font-semibold text-lg tabular-nums', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}
        >
          {formatMoney(t.netProfit)}
        </span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-muted-foreground text-sm">Followed your plan?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['yes', 'no'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={plan === v}
              onClick={() => setPlan(plan === v ? '' : v)}
              className={cn(
                'h-12 rounded-md border font-medium text-sm',
                plan === v && (v === 'yes' ? 'border-profit bg-profit/15' : 'border-loss bg-loss/15'),
              )}
            >
              {v === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </fieldset>

      {setups.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-muted-foreground text-sm">Setup</legend>
          <div className="flex flex-wrap gap-2">
            {setups.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={setup === s.id}
                onClick={() => setSetup(setup === s.id ? '' : s.id)}
                className={cn(
                  'h-11 rounded-full border px-3 text-sm md:h-9',
                  setup === s.id && 'border-foreground bg-accent',
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-1 text-muted-foreground text-sm">
        <label htmlFor="quick-sl">Initial stop loss (optional, makes R real)</label>
        <Input
          id="quick-sl"
          inputMode="decimal"
          placeholder={t.side === 'buy' ? `Below ${entry}` : `Above ${entry}`}
          value={sl}
          onChange={(e) => setSl(e.target.value)}
          className="h-11 text-base md:h-9 md:text-sm"
          aria-invalid={slError ? true : undefined}
        />
        {slError && <span className="text-loss text-xs">{slError}</span>}
      </div>

      {error && (
        <p role="alert" className="text-loss text-sm">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" type="button" disabled={pending} onClick={() => go(index + 1)} className="h-11 md:h-9">
          Skip
        </Button>
        <Button
          type="button"
          disabled={pending || (!plan && !setup && !sl.trim()) || !!slError}
          onClick={submit}
          className="h-11 md:h-9"
        >
          {pending ? 'Saving…' : 'Save & next'}
        </Button>
      </div>
    </section>
  );
}
