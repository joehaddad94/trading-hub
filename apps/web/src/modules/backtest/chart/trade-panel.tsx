'use client';

import { TZDate } from '@date-fns/tz';
import type { OrderView } from '@trading/backtest';
import { format } from 'date-fns';
import Decimal from 'decimal.js';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Trading } from './use-trading';

const REASON: Record<string, string> = { tp: 'TP', sl: 'SL', breakeven: 'BE', manual: 'Closed' };

function when(ms: number | null, timezone: string) {
  return ms === null ? '—' : format(new TZDate(ms, timezone), 'd MMM HH:mm');
}

/** Session orders and trades under the chart (spec §6): close, cancel, move SL/TP, breakeven, delete + undo. */
export function TradePanel({ trading, timezone }: { trading: Trading; timezone: string }) {
  const [open, setOpen] = useState(false);
  const live = trading.orders.filter((o) => o.status === 'pending' || o.status === 'open');
  const closed = trading.orders.filter((o) => o.status === 'closed');
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
          <span className="ml-auto">{open ? 'Hide' : 'Show'}</span>
        </button>
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
              No trades yet. Draw a long or short position during replay and press Buy/Sell.
            </p>
          )}
          <ul className="divide-y">
            {[...live, ...closed].map((o) => (
              <OrderRow key={o.id} order={o} trading={trading} timezone={timezone} />
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

function OrderRow({ order: o, trading, timezone }: { order: OrderView; trading: Trading; timezone: string }) {
  const [editing, setEditing] = useState(false);
  const [partial, setPartial] = useState(false);
  const [part, setPart] = useState(() => halfLots(o.lots));
  const [sl, setSl] = useState(o.sl);
  const [tp, setTp] = useState(o.tp);
  const num = (v: string | null) => (v === null ? '—' : Number(v).toFixed(2));
  const pnl = o.net === null ? null : Number(o.net);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5" data-testid="order-row" data-status={o.status}>
      <span className={cn('w-12 font-medium', o.side === 'long' ? 'text-profit' : 'text-loss')}>
        {o.side === 'long' ? 'Long' : 'Short'}
      </span>
      <span className="num">
        {o.instrument} {o.lots}
      </span>
      <span className="text-muted-foreground">
        {o.status === 'pending' ? `${o.type} @ ${num(o.entry)}` : `@ ${num(o.fillPrice)}`}
      </span>
      <span className="text-muted-foreground num">
        SL {num(o.sl)} · TP {num(o.tp)}
      </span>
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
            onClick={() => {
              const text = `Delete this backtest trade?\n\n${o.instrument} ${o.side}, ${when(o.filledAt, timezone)}, P/L ${o.net}\n\nIt will be removed from all stats and from the live-vs-backtest comparison.`;
              if (window.confirm(text)) void trading.remove(o);
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
              className="h-8 rounded-md px-2 hover:bg-accent/60"
              title="Move the stop to the fill price"
              onClick={() => void trading.modify(o.id, { sl: o.fillPrice ?? o.sl, tp: o.tp })}
            >
              BE
            </button>
          )}
          <button type="button" className="h-8 rounded-md px-2 hover:bg-accent/60" onClick={() => setEditing(!editing)}>
            SL/TP
          </button>
          {o.status === 'open' && Number(o.lots) > 0.01 && (
            <button
              type="button"
              className="h-8 rounded-md px-2 hover:bg-accent/60"
              aria-expanded={partial}
              title="Close part of the position"
              onClick={() => {
                setPart(halfLots(o.lots));
                setPartial(!partial);
              }}
            >
              Part
            </button>
          )}
          <button
            type="button"
            className="h-8 rounded-md px-2 hover:bg-accent/60"
            onClick={() => void (o.status === 'open' ? trading.close(o.id) : trading.cancel(o.id))}
          >
            {o.status === 'open' ? 'Close' : 'Cancel'}
          </button>
        </span>
      )}
      {partial && o.status === 'open' && (
        <form
          className="flex w-full items-center gap-2"
          aria-label="Partial close"
          onSubmit={(e) => {
            e.preventDefault();
            setPartial(false);
            void trading.close(o.id, part.trim());
          }}
        >
          <label className="flex items-center gap-1">
            Lots
            <input
              value={part}
              onChange={(e) => setPart(e.target.value)}
              inputMode="decimal"
              className="h-8 w-20 rounded-md border bg-background px-2 num"
            />
          </label>
          <span className="text-muted-foreground">of {o.lots}</span>
          <button type="submit" className="h-8 rounded-md bg-accent px-3">
            Close part
          </button>
        </form>
      )}
      {editing && o.status !== 'closed' && (
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            void trading.modify(o.id, { sl, tp });
          }}
        >
          <label className="flex items-center gap-1">
            SL
            <input
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              inputMode="decimal"
              className="h-8 w-28 rounded-md border bg-background px-2 num"
            />
          </label>
          <label className="flex items-center gap-1">
            TP
            <input
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              inputMode="decimal"
              className="h-8 w-28 rounded-md border bg-background px-2 num"
            />
          </label>
          <button type="submit" className="h-8 rounded-md bg-accent px-3">
            Save
          </button>
        </form>
      )}
    </li>
  );
}

/** Half a position, rounded down to 0.01 lots (never below 0.01): the default partial close. */
export function halfLots(lots: string): string {
  return Decimal.max(new Decimal(lots).div(2).toDecimalPlaces(2, Decimal.ROUND_DOWN), '0.01').toFixed(2);
}
