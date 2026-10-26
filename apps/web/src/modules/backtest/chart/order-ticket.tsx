'use client';

import {
  flipTicket,
  followPrice,
  pendingType,
  positionMetrics,
  type Side,
  type Sizing,
  signedUsd,
  type Ticket,
  ticketValid,
} from '@trading/backtest-engine';
import Decimal from 'decimal.js';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const SIZING_KEY = 'backtest.sizing';
const SIZE_VALUE = /^\d{1,9}(\.\d{1,4})?$/;

/** The ticket's size choice, remembered per browser (falls back to the run's risk %). */
export function readSizing(fallbackPct: string): Sizing {
  try {
    const raw = window.localStorage.getItem(SIZING_KEY);
    const stored = raw ? (JSON.parse(raw) as Sizing) : null;
    if (stored && ['lots', 'risk_usd', 'risk_pct'].includes(stored.mode) && SIZE_VALUE.test(stored.value)) {
      return stored;
    }
  } catch {
    // Private mode or a bad value: use the run's risk.
  }
  return { mode: 'risk_pct', value: fallbackPct };
}

export function saveSizing(sizing: Sizing) {
  try {
    window.localStorage.setItem(SIZING_KEY, JSON.stringify(sizing));
  } catch {
    // Not remembered; still used for this ticket.
  }
}

/** Ticket wording: "Buy", "Buy limit", "Sell stop"… */
export function ticketTitle(ticket: Ticket, price: number | null): string {
  const verb = ticket.side === 'long' ? 'Buy' : 'Sell';
  if (ticket.kind === 'market' || price === null) return verb;
  return `${verb} ${pendingType(ticket.side, ticket.entry, price)}`;
}

/** Ask = last close + spread (what a market buy pays); bid = last close. */
export function quotes(close: number | null, spreadPoints: string, priceDigits: number) {
  if (close === null) return { bid: null, ask: null };
  return {
    bid: close.toFixed(priceDigits),
    ask: new Decimal(String(close)).plus(spreadPoints || '0').toFixed(priceDigits),
  };
}

/**
 * TradingView-style Sell / Buy buttons on the chart, with the current bid and ask. The first press opens the
 * order ticket; pressing the same side again places it.
 */
export function TradeButtons({
  enabled,
  bid,
  ask,
  open,
  onPress,
}: {
  enabled: boolean;
  bid: string | null;
  ask: string | null;
  /** Side of the open ticket, if any. */
  open: Side | null;
  onPress: (side: Side) => void;
}) {
  const hint = enabled ? undefined : 'Start replay to trade';
  return (
    <fieldset
      aria-label="Trade"
      className="m-0 flex min-w-0 overflow-hidden rounded-md border bg-popover/90 text-xs shadow-md backdrop-blur"
      title={hint}
    >
      {(['short', 'long'] as const).map((side) => {
        const buy = side === 'long';
        const pressed = open === side;
        return (
          <button
            key={side}
            type="button"
            disabled={!enabled}
            aria-pressed={pressed}
            aria-keyshortcuts={buy ? 'Shift+B' : 'Shift+S'}
            onClick={() => onPress(side)}
            title={
              enabled
                ? pressed
                  ? `Place the ${buy ? 'buy' : 'sell'} (${buy ? 'Shift+B' : 'Shift+S'} or Enter)`
                  : `${buy ? 'Buy' : 'Sell'} (${buy ? 'Shift+B' : 'Shift+S'})`
                : hint
            }
            className={cn(
              'flex min-w-[5.5rem] flex-col items-start px-3 py-1 leading-tight disabled:cursor-not-allowed disabled:opacity-50',
              buy ? 'items-end border-l text-right' : '',
              buy ? 'text-profit hover:bg-profit/15' : 'text-loss hover:bg-loss/15',
              pressed && (buy ? 'bg-profit/25' : 'bg-loss/25'),
            )}
          >
            <span className="font-semibold uppercase tracking-wide">{buy ? 'Buy' : 'Sell'}</span>
            <span className="num text-foreground/90">{(buy ? ask : bid) ?? '—'}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

type Field = 'entry' | 'sl' | 'tp';

/**
 * The order ticket (backtester spec §6.1): side, market or pending, entry, stop, target and size, all also
 * movable on the chart as lines. Market orders fill at the next 1m open (plus spread on buys), as on FundedNext.
 */
export function OrderTicket({
  ticket,
  price,
  instrument,
  balance,
  sizing,
  busy,
  onChange,
  onSizing,
  onPlace,
  onClose,
  compact = false,
}: {
  ticket: Ticket;
  /** Last close: the market price. */
  price: number | null;
  instrument: { code: string; pointValue: string; priceDigits: number };
  balance: string;
  sizing: Sizing;
  busy: boolean;
  onChange: (next: Ticket) => void;
  onSizing: (next: Sizing) => void;
  onPlace: () => void;
  onClose: () => void;
  /**
   * Phone held upright: one row (side, stop, target, size, place) that opens into the full ticket on a tap, so
   * the chart keeps most of its height (audit 25 Oct, #6). The lines on the chart still move stop and target.
   */
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const m = positionMetrics({
    side: ticket.side,
    entry: ticket.entry,
    stop: ticket.sl,
    target: ticket.tp,
    pointValue: instrument.pointValue,
    balance,
    sizing,
  });
  const valid = ticketValid(ticket) && Number(m.lots) > 0;
  const buy = ticket.side === 'long';
  const title = ticketTitle(ticket, price);
  const set = (field: Field, value: number) => {
    // Typing an entry makes the ticket a pending order, as dragging its line does.
    onChange({ ...ticket, [field]: value, ...(field === 'entry' ? { kind: 'pending' as const } : {}) });
  };
  const toggle = compact && (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      aria-expanded={expanded}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
      title={expanded ? 'Fewer details' : 'Edit the order'}
    >
      {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronUp className="size-4" aria-hidden />}
      <span className="sr-only">{expanded ? 'Fewer details' : 'Edit order'}</span>
    </button>
  );
  if (compact && !expanded) {
    return (
      <form
        aria-label="Order ticket"
        data-testid="order-ticket"
        data-kind={ticket.kind}
        data-compact="true"
        className="flex w-full items-center gap-2 rounded-lg border bg-popover/95 p-1.5 text-xs shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onPlace();
        }}
      >
        {toggle}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="grid min-w-0 flex-1 grid-cols-2 gap-x-2 text-left num"
          title="Edit the order"
        >
          <span className="truncate text-loss">SL {ticket.sl.toFixed(instrument.priceDigits)}</span>
          <span className="truncate text-profit">TP {ticket.tp.toFixed(instrument.priceDigits)}</span>
          <span className="truncate text-muted-foreground">−${m.riskUsd}</span>
          <span className="truncate text-muted-foreground">RR 1:{m.rr}</span>
        </button>
        <button
          type="submit"
          disabled={!valid || busy}
          className={cn(
            'h-9 shrink-0 rounded-md px-3 font-semibold text-sm disabled:opacity-50',
            buy ? 'bg-profit text-background' : 'bg-loss text-background',
          )}
        >
          {title} {m.lots}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          title="Close the ticket"
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">Close ticket</span>
        </button>
      </form>
    );
  }
  return (
    <form
      aria-label="Order ticket"
      data-testid="order-ticket"
      data-kind={ticket.kind}
      className="flex w-full flex-col gap-2 rounded-lg border bg-popover/95 p-2 text-xs shadow-lg backdrop-blur roomy:w-80"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) onPlace();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-1">
        {toggle}
        <Segmented
          label="Side"
          value={ticket.side}
          options={[
            { id: 'long', label: 'Buy', className: 'aria-pressed:bg-profit/25 aria-pressed:text-profit' },
            { id: 'short', label: 'Sell', className: 'aria-pressed:bg-loss/25 aria-pressed:text-loss' },
          ]}
          onChange={(side) => {
            // Stop and target mirror around the entry so the other side is valid straight away.
            if (side !== ticket.side) onChange(flipTicket(ticket, instrument.priceDigits));
          }}
        />
        <Segmented
          label="Order type"
          value={ticket.kind}
          options={[
            { id: 'market', label: 'Market' },
            { id: 'pending', label: 'Limit / Stop' },
          ]}
          onChange={(kind) => {
            if (kind === ticket.kind) return;
            // Back to market: the entry jumps to the price, stop and target keep their distances.
            const next = { ...ticket, kind };
            onChange(kind === 'market' && price !== null ? followPrice(next, price, instrument.priceDigits) : next);
          }}
        />
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          title="Close the ticket (Esc)"
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">Close ticket</span>
        </button>
      </div>
      {ticket.kind === 'pending' && (
        <div className="flex items-center gap-2">
          <span className="w-11 text-muted-foreground">Entry</span>
          <PriceField
            label="Entry price"
            value={ticket.entry}
            digits={instrument.priceDigits}
            onCommit={(v) => set('entry', v)}
          />
          <span className="shrink-0 text-muted-foreground">{title.replace(/^(Buy|Sell) /, '')}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-loss">Stop</span>
          <PriceField
            label="Stop loss"
            value={ticket.sl}
            digits={instrument.priceDigits}
            onCommit={(v) => set('sl', v)}
          />
          <span className="num text-muted-foreground">
            {m.slPoints} pts · −${m.riskUsd}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-profit">Target</span>
          <PriceField
            label="Take profit"
            value={ticket.tp}
            digits={instrument.priceDigits}
            onCommit={(v) => set('tp', v)}
          />
          <span className="num text-muted-foreground">
            {m.tpPoints} pts · {signedUsd(m.rewardUsd)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-11 text-muted-foreground">Size</span>
        <SizeControls sizing={sizing} onSizing={onSizing} />
        <span className="num ml-auto text-muted-foreground">
          {m.lots} lots · {m.riskPct}%
        </span>
      </div>
      {!ticketValid(ticket) && (
        <p role="alert" className="text-loss">
          {buy
            ? 'A buy needs its stop below and target above the entry.'
            : 'A sell needs its stop above and target below the entry.'}
        </p>
      )}
      <button
        type="submit"
        disabled={!valid || busy}
        className={cn(
          'h-10 rounded-md font-semibold text-sm disabled:opacity-50',
          buy ? 'bg-profit text-background' : 'bg-loss text-background',
        )}
      >
        {title} {m.lots} {instrument.code}
        <span className="ml-2 font-normal opacity-80">RR 1:{m.rr}</span>
      </button>
      <p className="hidden text-muted-foreground roomy:block">
        Drag the lines on the chart · Enter places · Esc closes
      </p>
    </form>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; className?: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <fieldset aria-label={label} className="m-0 flex min-w-0 rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            'h-7 rounded px-2 text-muted-foreground aria-pressed:bg-accent aria-pressed:text-foreground',
            o.className,
          )}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** A price box that follows its value (lines dragged on the chart) unless you are typing in it. */
function PriceField({
  label,
  value,
  digits,
  onCommit,
}: {
  label: string;
  value: number;
  digits: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(value.toFixed(digits));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value.toFixed(digits));
  }, [value, digits]);
  const commit = () => {
    const v = Number(text.trim());
    if (text.trim() !== '' && Number.isFinite(v) && v > 0) onCommit(Number(v.toFixed(digits)));
    else setText(value.toFixed(digits));
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className="h-8 w-full min-w-0 rounded-md border bg-background px-2 num"
    />
  );
}

/** Size by (Risk % / Risk $ / Lots) and its value: one remembered size for the ticket and every box. */
export function SizeControls({ sizing, onSizing }: { sizing: Sizing; onSizing: (next: Sizing) => void }) {
  return (
    <>
      <select
        aria-label="Size by"
        value={sizing.mode}
        onChange={(e) => onSizing({ mode: e.target.value as Sizing['mode'], value: sizing.value })}
        className="h-8 rounded-md border bg-background px-1"
      >
        <option value="risk_pct">Risk %</option>
        <option value="risk_usd">Risk $</option>
        <option value="lots">Lots</option>
      </select>
      <SizeField value={sizing.value} onCommit={(value) => onSizing({ mode: sizing.mode, value })} />
    </>
  );
}

function SizeField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const v = text.trim();
    if (SIZE_VALUE.test(v) && Number(v) > 0) onCommit(v);
    else setText(value);
  };
  return (
    <input
      aria-label="Size"
      inputMode="decimal"
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className="h-8 w-16 rounded-md border bg-background px-2 num"
    />
  );
}
