'use client';

import { TZDate } from '@date-fns/tz';
import type { OrderView } from '@trading/backtest';
import { format } from 'date-fns';
import { useState } from 'react';
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
  if (!trading.session) return null;
  return (
    <section className="border-t text-sm" aria-label="Simulated trades">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 px-4 text-left text-muted-foreground hover:bg-accent/40"
      >
        <span className="font-medium text-foreground">{trading.session.name}</span>
        <span>
          {live.length} open · {closed.length} closed
        </span>
        <span className="ml-auto">{open ? 'Hide' : 'Show'}</span>
      </button>
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
      {trading.undo && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-popover px-4 py-2 shadow-lg"
        >
          Trade deleted.
          <button type="button" onClick={() => void trading.restore()} className="font-medium underline">
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

function OrderRow({ order: o, trading, timezone }: { order: OrderView; trading: Trading; timezone: string }) {
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState(o.sl);
  const [tp, setTp] = useState(o.tp);
  const num = (v: string | null) => (v === null ? '—' : Number(v).toFixed(2));
  const pnl = o.net === null ? null : Number(o.net);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5" data-testid="order-row" data-status={o.status}>
      <span className={cn('w-12 font-medium', o.side === 'long' ? 'text-profit' : 'text-loss')}>
        {o.side === 'long' ? 'Long' : 'Short'}
      </span>
      <span className="tabular-nums">
        {o.instrument} {o.lots}
      </span>
      <span className="text-muted-foreground">
        {o.status === 'pending' ? `${o.type} @ ${num(o.entry)}` : `@ ${num(o.fillPrice)}`}
      </span>
      <span className="text-muted-foreground tabular-nums">
        SL {num(o.sl)} · TP {num(o.tp)}
      </span>
      {o.status === 'closed' ? (
        <>
          <span className="text-muted-foreground">
            {REASON[o.exitReason ?? ''] ?? ''} {when(o.closedAt, timezone)}
            {o.ambiguous && ' · ambiguous bar'}
          </span>
          <span className={cn('tabular-nums font-medium', pnl !== null && pnl < 0 ? 'text-loss' : 'text-profit')}>
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
              onClick={() => void trading.modify(o.id, o.fillPrice ?? o.sl, o.tp)}
            >
              BE
            </button>
          )}
          <button type="button" className="h-8 rounded-md px-2 hover:bg-accent/60" onClick={() => setEditing(!editing)}>
            SL/TP
          </button>
          <button
            type="button"
            className="h-8 rounded-md px-2 hover:bg-accent/60"
            onClick={() => void (o.status === 'open' ? trading.close(o.id) : trading.cancel(o.id))}
          >
            {o.status === 'open' ? 'Close' : 'Cancel'}
          </button>
        </span>
      )}
      {editing && o.status !== 'closed' && (
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            void trading.modify(o.id, sl, tp);
          }}
        >
          <label className="flex items-center gap-1">
            SL
            <input
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              inputMode="decimal"
              className="h-8 w-28 rounded-md border bg-background px-2 tabular-nums"
            />
          </label>
          <label className="flex items-center gap-1">
            TP
            <input
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              inputMode="decimal"
              className="h-8 w-28 rounded-md border bg-background px-2 tabular-nums"
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
