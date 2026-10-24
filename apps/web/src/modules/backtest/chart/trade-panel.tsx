'use client';

import { TZDate } from '@date-fns/tz';
import type { OrderView } from '@trading/backtest';
import { openPnl, partOf, signedUsd } from '@trading/backtest-engine';
import { format } from 'date-fns';
import Decimal from 'decimal.js';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogs } from '@/components/dialogs';
import { cn } from '@/lib/utils';
import type { Trading } from './use-trading';

const REASON: Record<string, string> = { tp: 'TP', sl: 'SL', breakeven: 'BE', manual: 'Closed' };

function when(ms: number | null, timezone: string) {
  return ms === null ? '—' : format(new TZDate(ms, timezone), 'd MMM HH:mm');
}

type Instrument = { code: string; pointValue: string; priceDigits: number };

/** Open P/L of the run's open positions on this instrument at `price` (others have no price on this chart). */
export function openTotal(orders: OrderView[], instrument: Instrument, price: number | null): string | null {
  const open = orders.filter((o) => o.status === 'open' && o.instrument === instrument.code && o.fillPrice !== null);
  if (price === null || open.length === 0) return null;
  return open
    .reduce(
      (sum, o) =>
        sum.plus(openPnl({ side: o.side, fill: o.fillPrice as string, lots: o.lots }, price, instrument.pointValue)),
      new Decimal(0),
    )
    .toFixed(2);
}

/**
 * Run orders and trades under the chart (spec §6): open P/L, close (all, part), cancel, edit SL/TP or a pending
 * entry, break-even, delete + undo.
 */
export function TradePanel({
  trading,
  timezone,
  price,
  instrument,
}: {
  trading: Trading;
  timezone: string;
  /** Last close: open P/L is read there. */
  price: number | null;
  instrument: Instrument;
}) {
  const [open, setOpen] = useState(false);
  const live = trading.orders.filter((o) => o.status === 'pending' || o.status === 'open');
  const closed = trading.orders.filter((o) => o.status === 'closed');
  const total = openTotal(trading.orders, instrument, price);
  // A newly placed order opens the list, so the trade you just made is in view.
  const seen = useRef(trading.orders.length);
  useEffect(() => {
    if (trading.orders.length > seen.current) setOpen(true);
    seen.current = trading.orders.length;
  }, [trading.orders.length]);
  if (!trading.session) return null;
  return (
    <section className="border-t text-sm" aria-label="Simulated trades">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-9 flex-1 items-center gap-2 px-4 text-left text-muted-foreground hover:bg-accent/40"
        >
          <span className="font-medium text-foreground">{trading.session.name}</span>
          <span>
            {live.length} open · {closed.length} closed
          </span>
          {total !== null && (
            <span
              className={cn('num font-medium', total.startsWith('-') ? 'text-loss' : 'text-profit')}
              data-testid="open-pnl"
              title="Open P/L at the last close, before closing costs"
            >
              {signedUsd(total)}
            </span>
          )}
          <span className="ml-auto">{open ? 'Hide' : 'Show'}</span>
        </button>
        {live.length > 1 && (
          <button
            type="button"
            className="flex h-9 items-center border-l px-3 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            title="Close every open position and cancel every pending order"
            onClick={() => void trading.closeAll()}
          >
            Close all
          </button>
        )}
        <Link
          href={`/backtest/sessions/${trading.session.id}`}
          className="flex h-9 items-center border-l px-3 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          Stats
        </Link>
      </div>
      {trading.error && (
        <p role="alert" className="px-4 pb-1 text-loss">
          {trading.error}
        </p>
      )}
      {open && (
        <div className="max-h-56 overflow-y-auto px-2 pb-2 md:px-4">
          {trading.orders.length === 0 && (
            <p className="py-2 text-muted-foreground">
              No trades yet. Press Buy or Sell on the chart (Shift+B / Shift+S) during replay.
            </p>
          )}
          <ul className="divide-y">
            {[...live, ...closed].map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                trading={trading}
                timezone={timezone}
                price={o.instrument === instrument.code ? price : null}
                instrument={instrument}
              />
            ))}
          </ul>
        </div>
      )}
      {trading.undo &&
        // On <body>, above the phone tab bar: inside the chart workspace (its own stacking context) the bar covers it.
        createPortal(
          <div
            role="status"
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-popover px-4 py-2 shadow-lg md:bottom-4"
          >
            Trade deleted.
            <button type="button" onClick={() => void trading.restore()} className="font-medium underline">
              Undo
            </button>
          </div>,
          document.body,
        )}
    </section>
  );
}

function OrderRow({
  order: o,
  trading,
  timezone,
  price,
  instrument,
}: {
  order: OrderView;
  trading: Trading;
  timezone: string;
  price: number | null;
  instrument: Instrument;
}) {
  const dialogs = useDialogs();
  const [panel, setPanel] = useState<'edit' | 'part' | null>(null);
  const digits = o.instrument === instrument.code ? instrument.priceDigits : 2;
  const num = (v: string | null) => (v === null ? '—' : Number(v).toFixed(digits));
  const pnl = o.net === null ? null : Number(o.net);
  const waiting = o.status === 'pending' && o.type === 'market';
  const live =
    o.status === 'open' && price !== null && o.fillPrice !== null && o.instrument === instrument.code
      ? openPnl({ side: o.side, fill: o.fillPrice, lots: o.lots }, price, instrument.pointValue)
      : null;
  const toggle = (next: 'edit' | 'part') => setPanel(panel === next ? null : next);
  const btn = 'h-8 rounded-md px-2 hover:bg-accent/60';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5" data-testid="order-row" data-status={o.status}>
      <span className={cn('w-12 font-medium', o.side === 'long' ? 'text-profit' : 'text-loss')}>
        {o.side === 'long' ? 'Long' : 'Short'}
      </span>
      <span className="num">
        {o.instrument} {o.lots}
      </span>
      <span className="text-muted-foreground" data-testid="order-entry">
        {waiting
          ? 'market · fills at next open'
          : o.status === 'pending'
            ? `${o.type} @ ${num(o.entry)}`
            : `@ ${num(o.fillPrice)}`}
      </span>
      <span className="text-muted-foreground num">
        SL {num(o.sl)} · TP {num(o.tp)}
      </span>
      {live !== null && (
        <span
          className={cn('num font-medium', live.startsWith('-') ? 'text-loss' : 'text-profit')}
          data-testid="order-open-pnl"
          title="Open P/L at the last close, before closing costs"
        >
          {signedUsd(live)}
        </span>
      )}
      {o.status === 'closed' ? (
        <>
          <span className="text-muted-foreground">
            {REASON[o.exitReason ?? ''] ?? ''} {when(o.closedAt, timezone)}
            {o.ambiguous && ' · ambiguous bar'}
          </span>
          <span className={cn('num font-medium', pnl !== null && pnl < 0 ? 'text-loss' : 'text-profit')}>
            {o.net} {o.r !== null && `(${o.r}R)`}
          </span>
          <button
            type="button"
            className="ml-auto h-8 rounded-md px-2 text-muted-foreground hover:bg-accent/60"
            onClick={async () => {
              const ok = await dialogs.confirm({
                title: 'Delete this backtest trade?',
                message: (
                  <>
                    <span className="num block text-foreground">
                      {o.instrument} {o.side}, {when(o.filledAt, timezone)}, P/L {o.net}
                    </span>
                    It will be removed from all stats and from the live-vs-backtest comparison.
                  </>
                ),
                confirmLabel: 'Delete',
                tone: 'destructive',
              });
              if (ok) void trading.remove(o);
            }}
          >
            Delete
          </button>
        </>
      ) : (
        <span className="ml-auto flex items-center gap-1">
          {o.status === 'open' && (
            <button
              type="button"
              className={btn}
              aria-label="Break-even"
              title="Move the stop to the fill price"
              onClick={() => void trading.modify(o.id, { sl: o.fillPrice ?? o.sl, tp: o.tp })}
            >
              BE
            </button>
          )}
          <button
            type="button"
            className={btn}
            aria-expanded={panel === 'edit'}
            title={o.status === 'pending' && !waiting ? 'Change entry, stop or target' : 'Change stop or target'}
            onClick={() => toggle('edit')}
          >
            {o.status === 'pending' && !waiting ? 'Edit' : 'SL/TP'}
          </button>
          {o.status === 'open' && Number(o.lots) > 0.01 && (
            <button
              type="button"
              className={btn}
              aria-expanded={panel === 'part'}
              title="Close part of the position"
              onClick={() => toggle('part')}
            >
              Part
            </button>
          )}
          <button
            type="button"
            className={cn(btn, 'font-medium')}
            onClick={() => void (o.status === 'open' ? trading.close(o.id) : trading.cancel(o.id))}
          >
            {o.status === 'open' ? 'Close' : 'Cancel'}
          </button>
        </span>
      )}
      {panel === 'part' && o.status === 'open' && (
        <PartClose
          lots={o.lots}
          onClose={(lots) => {
            setPanel(null);
            void trading.close(o.id, lots);
          }}
        />
      )}
      {panel === 'edit' && o.status !== 'closed' && (
        <EditLevels
          order={o}
          digits={digits}
          onSave={(levels) => {
            setPanel(null);
            void trading.modify(o.id, levels);
          }}
        />
      )}
    </li>
  );
}

const SHARES = [
  { share: 0.25, label: '25%' },
  { share: 0.5, label: '50%' },
  { share: 0.75, label: '75%' },
];

/** Part close: one tap on 25 / 50 / 75%, or any lot size. */
function PartClose({ lots, onClose }: { lots: string; onClose: (lots: string) => void }) {
  const [part, setPart] = useState(() => halfLots(lots));
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      aria-label="Partial close"
      onSubmit={(e) => {
        e.preventDefault();
        onClose(part.trim());
      }}
    >
      {SHARES.map((s) => (
        <button
          key={s.label}
          type="button"
          className="h-8 rounded-md border px-2 hover:bg-accent/60"
          title={`Close ${partOf(lots, s.share)} lots`}
          onClick={() => onClose(partOf(lots, s.share))}
        >
          {s.label}
        </button>
      ))}
      <label className="flex items-center gap-1">
        Lots
        <input
          value={part}
          onChange={(e) => setPart(e.target.value)}
          inputMode="decimal"
          className="h-8 w-20 rounded-md border bg-background px-2 num"
        />
      </label>
      <span className="text-muted-foreground">of {lots}</span>
      <button type="submit" className="h-8 rounded-md bg-accent px-3">
        Close part
      </button>
    </form>
  );
}

/**
 * Stop and target (and a limit/stop order's entry) as typed prices. The boxes start from the order as it is
 * now, so a fill that moved the levels isn't undone by saving.
 */
function EditLevels({
  order: o,
  digits,
  onSave,
}: {
  order: OrderView;
  digits: number;
  onSave: (levels: { sl: string; tp: string; entry?: string }) => void;
}) {
  const fmt = (v: string) => Number(v).toFixed(digits);
  const movable = o.status === 'pending' && o.type !== 'market';
  const [entry, setEntry] = useState(() => fmt(o.entry));
  const [sl, setSl] = useState(() => fmt(o.sl));
  const [tp, setTp] = useState(() => fmt(o.tp));
  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex items-center gap-1">
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(e) => set(e.target.value)}
        onFocus={(e) => e.target.select()}
        inputMode="decimal"
        className="h-8 w-28 rounded-md border bg-background px-2 num"
      />
    </label>
  );
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      aria-label="Edit levels"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          sl: sl.trim(),
          tp: tp.trim(),
          ...(movable && entry.trim() !== fmt(o.entry) ? { entry: entry.trim() } : {}),
        });
      }}
    >
      {movable && field('Entry', entry, setEntry)}
      {field('SL', sl, setSl)}
      {field('TP', tp, setTp)}
      <button type="submit" className="h-8 rounded-md bg-accent px-3">
        Save
      </button>
    </form>
  );
}

/** Half a position, rounded down to 0.01 lots (never below 0.01): the default partial close. */
export function halfLots(lots: string): string {
  return partOf(lots, 0.5);
}
