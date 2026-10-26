'use client';

import type { Drawing, OrderView, SessionView } from '@trading/backtest';
import {
  type Bar,
  followPrice,
  newTicket,
  parseTimeframe,
  pendingType,
  positionMetrics,
  type Side,
  type Sizing,
  TIMEFRAMES,
  type Ticket,
  type Timeframe,
} from '@trading/backtest-engine';
import { Maximize2, Minimize2, Newspaper, SlidersHorizontal } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { symbolWithAlias } from '@/lib/symbols';
import { cn } from '@/lib/utils';
import { DrawingProperties, DrawingToolbar } from './drawing-toolbar';
import { IndicatorMenu } from './indicator-menu';
import { activeIndicators, type IndicatorPrefs, normalisePrefs } from './indicators';
import { chartKeyFor } from './keys';
import { type ChartApi, KLineChart } from './kline-chart';
import { BARS_PAGE, liveUntil, prefetchBars } from './loader';
import { NewsPanel } from './news-panel';
import { type DraftLines, useOrderHandles } from './order-handles';
import { orderMarks } from './order-lines';
import { OrderTicket, quotes, readSizing, SizeControls, saveSizing, TradeButtons, ticketTitle } from './order-ticket';
import { PickBar } from './pick-line';
import { ReplayControls } from './replay-controls';
import { toolForKey } from './tools/registry';
import { TradePanel } from './trade-panel';
import { type DrawingActions, useDrawings } from './use-drawings';
import { eventsInBar, type NewsFilter, toMarkers, useNewsEvents } from './use-news-events';
import { RESTART_BLOCKED, useReplay } from './use-replay';
import { type TradingActions, useTrading } from './use-trading';

export type WorkspaceInstrument = {
  code: string;
  displayName: string;
  priceDigits: number;
  pointValue: string;
  /** Default spread (points) when the run has no cost override. */
  spreadPoints?: string;
  dataFrom?: number | null;
  dataTo?: number | null;
};

/** How long the chart must sit still before other timeframes/instruments are prefetched. */
const PREFETCH_DELAY_MS = 1200;

/** Position sizing balance until backtest sessions carry their own (M21). */
const DEFAULT_BALANCE = '25000';

const TIMEZONES = [
  { id: 'Asia/Beirut', label: 'Beirut' },
  { id: 'America/New_York', label: 'New York' },
] as const;

const PREFS_KEY = 'backtest.chart';
const FULL_KEY = 'backtest.fullScreen';
const DATA_NOTE = 'Historical data from Dukascopy; prices may differ slightly from your broker.';
type Impact = NewsFilter['impacts'][number];
type Prefs = {
  timezone: string;
  sessions: boolean;
  impacts: Impact[];
  allCurrencies: boolean;
  indicators: IndicatorPrefs;
};
const DEFAULT_PREFS: Prefs = {
  timezone: 'Asia/Beirut',
  sessions: true,
  impacts: ['high'],
  allCurrencies: false,
  indicators: normalisePrefs(null),
};
const IMPACT_TOGGLES: { id: Impact; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Med' },
  { id: 'low', label: 'Low' },
];

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const stored = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...stored, indicators: normalisePrefs(stored.indicators) };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** US30 first when it exists (Joe's main market), else the first instrument. */
function defaultInstrument(list: WorkspaceInstrument[]): string {
  return list.find((i) => i.code === 'US30')?.code ?? list[0]?.code ?? 'US30';
}

/**
 * Joe's rule for stepping back (21 Oct 2026): only with no open trade or pending order, and never before the
 * last closed trade's exit, so a run can't be re-traded with hindsight.
 */
export function stepBackRule(orders: Pick<OrderView, 'status' | 'closedAt'>[]): {
  blocked: string | null;
  floor: number | null;
} {
  const live = orders.some((o) => o.status === 'open' || o.status === 'pending');
  const closes = orders.flatMap((o) => (o.status === 'closed' && o.closedAt !== null ? [o.closedAt] : []));
  return {
    blocked: live ? 'Close or cancel your open trades to step back.' : null,
    floor: closes.length > 0 ? Math.max(...closes) : null,
  };
}

/** Keyboard: 1 / 5 / F pick the timeframe (spec §2.2). Ignored while typing in a field. */
export function timeframeForKey(key: string): Timeframe | null {
  if (key === '1') return 1;
  if (key === '5') return 5;
  if (key === 'f' || key === 'F') return 15;
  return null;
}

/** Backtest Lab chart: instrument switch, 1m/5m/15m, session shading, Beirut or New York time, replay. */
export function ChartWorkspace({
  instruments,
  currencies,
  drawings: initialDrawings,
  drawingActions,
  trading: initialTrading,
  tradingActions,
}: {
  instruments: WorkspaceInstrument[];
  /** News › "currencies that count": the default marker filter. */
  currencies: string[];
  drawings: Drawing[];
  drawingActions: DrawingActions;
  trading: { session: SessionView; orders: OrderView[] } | null;
  tradingActions: TradingActions;
}) {
  const [code, setCode] = useQueryState('i', parseAsString.withDefault(defaultInstrument(instruments)));
  const [tfParam, setTfParam] = useQueryState('tf', parseAsString.withDefault('5'));
  const tf = parseTimeframe(tfParam) ?? 5;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const instrument = instruments.find((i) => i.code === code) ?? instruments[0];
  const [at, setAt] = useQueryState('at', parseAsString.withOptions({ throttleMs: 500 }));
  const [picking, setPicking] = useState(false);
  /** Phones: the bar a tap put the pick line on, waiting for Start. */
  const [placed, setPlaced] = useState<number | null>(null);
  useEffect(() => {
    if (!picking) setPlaced(null);
  }, [picking]);
  const [moreOpen, setMoreOpen] = useState(false);
  const onCursor = useCallback(
    (cursor: number | null) => void setAt(cursor === null ? null : new Date(cursor).toISOString()),
    [setAt],
  );
  // Filled in once the run's orders are known (below): an open or pending trade locks the replay to its time.
  const restartBlocked = useRef<string | null>(null);
  const [resumeAt] = useState(() =>
    initialTrading?.orders.some((o) => o.status === 'open' || o.status === 'pending')
      ? initialTrading.session.cursor
      : null,
  );
  const replay = useReplay({
    instrument: instrument?.code ?? 'US30',
    tf,
    // A run with an open trade always reopens where the replay left it, so the trade can be managed.
    initialCursor: at && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : resumeAt,
    onCursor,
    restartBlocked,
  });
  const [chartApi, setChartApi] = useState<ChartApi | null>(null);
  const onChartReady = useCallback(
    (api: ChartApi | null) => {
      replay.onChartReady(api);
      setChartApi(api);
    },
    [replay.onChartReady],
  );
  // One remembered size for the order ticket and every long/short box.
  const riskPct = initialTrading?.session.riskPct ?? '0.5';
  const [sizing, setSizingState] = useState<Sizing>({ mode: 'risk_pct', value: riskPct });
  const sizingRef = useRef(sizing);
  useEffect(() => {
    const stored = readSizing(riskPct);
    sizingRef.current = stored;
    setSizingState(stored);
  }, [riskPct]);
  const setSizing = useCallback((next: Sizing) => {
    sizingRef.current = next;
    setSizingState(next);
    saveSizing(next);
  }, []);
  const drawings = useDrawings(
    chartApi?.chart ?? null,
    {
      instrument: instrument?.code ?? 'US30',
      pointValue: instrument?.pointValue ?? '10',
      priceDigits: instrument?.priceDigits ?? 2,
      tf,
      balance: initialTrading?.session.startingBalance ?? DEFAULT_BALANCE,
      sizing,
    },
    initialDrawings,
    drawingActions,
  );
  const { onChartClick } = drawings;
  const onBarClick = useCallback(
    (barStart: number) => {
      onChartClick();
      if (!picking) return;
      setPicking(false);
      replay.startAtBar(barStart);
    },
    [picking, replay.startAtBar, onChartClick],
  );
  // Right-click › "Replay from here" (audit U8); the menu sits where the pointer was.
  const [menu, setMenu] = useState<{ bar: number; x: number; y: number } | null>(null);
  // While picking, a right-click cancels instead (TradingView-like).
  const onBarContextMenu = useCallback(
    (bar: number, at: { x: number; y: number }) => {
      if (picking) setPicking(false);
      else setMenu({ bar, ...at });
    },
    [picking],
  );
  useEffect(() => {
    if (!picking && !menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPicking(false);
      setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, menu]);

  useEffect(() => setPrefs(readPrefs()), []);

  const updatePrefs = (next: Partial<Prefs>) => {
    setPrefs((current) => {
      const merged = { ...current, ...next };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch {
        // Private mode: the choice just isn't remembered.
      }
      return merged;
    });
  };

  const { cursor, step, setPlaying, playing } = replay;
  const { start: startTool, cancel: cancelTool, removeSelected, undo, redo } = drawings;
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  const filter = useMemo<NewsFilter>(
    () => ({ impacts: prefs.impacts, currencies: prefs.allCurrencies ? [] : currencies }),
    [prefs.impacts, prefs.allCurrencies, currencies],
  );
  const events = useNewsEvents(cursor, filter, prefs.impacts.length > 0);
  const markers = useMemo(() => toMarkers(events, tf), [events, tf]);
  const hovered = eventsInBar(events, hoverBar, tf, cursor);
  const indicators = useMemo(() => activeIndicators(prefs.indicators), [prefs.indicators]);
  const trading = useTrading({
    session: initialTrading?.session ?? null,
    initialOrders: initialTrading?.orders ?? [],
    actions: tradingActions,
    cursor,
    instrument: {
      code: instrument?.code ?? 'US30',
      pointValue: instrument?.pointValue ?? '10',
      priceDigits: instrument?.priceDigits ?? 2,
    },
  });
  const priceDigits = instrument?.priceDigits ?? 2;
  const pointValue = instrument?.pointValue ?? '10';
  const balance = initialTrading?.session.startingBalance ?? DEFAULT_BALANCE;
  // Order ticket (Buy/Sell): a draft order shown as lines on the chart until it's placed. Refs mirror the state
  // so Enter right after typing in a box places what was typed.
  const [lastClose, setLastClose] = useState<number | null>(null);
  const onLastBar = useCallback((bar: Bar | null) => setLastClose(bar?.close ?? null), []);
  const [ticket, setTicketState] = useState<Ticket | null>(null);
  const ticketRef = useRef<Ticket | null>(null);
  const setTicket = useCallback((next: Ticket | null) => {
    ticketRef.current = next;
    setTicketState(next);
  }, []);
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  // A market ticket rides with the price as replay moves; leaving replay or switching instrument drops it.
  useEffect(() => {
    const t = ticketRef.current;
    if (t && lastClose !== null) setTicket(followPrice(t, lastClose, priceDigits));
  }, [lastClose, priceDigits, setTicket]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new instrument or the end of replay drops the ticket.
  useEffect(() => setTicket(null), [instrument?.code, cursor === null, setTicket]);
  const tradable = trading.session !== null && cursor !== null && lastClose !== null;
  const placeTicket = async () => {
    const t = ticketRef.current;
    // A ref, not the state: two quick presses (Enter, B B) must not place twice.
    if (!t || cursor === null || placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const placed = await trading.place(
        {
          side: t.side,
          points: [
            { ts: cursor, price: t.entry },
            { ts: cursor, price: t.sl },
            { ts: cursor, price: t.tp },
          ],
          sizing: sizingRef.current,
        },
        t.kind,
        null,
      );
      if (placed) setTicket(null);
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };
  const placeRef = useRef(placeTicket);
  placeRef.current = placeTicket;
  /** Buy/Sell (button or B/S): opens the ticket, flips it, or places it when it is already open on that side. */
  const pressSide = useCallback(
    (side: Side) => {
      if (!tradable || lastClose === null) return;
      const t = ticketRef.current;
      if (t?.side === side) {
        void placeRef.current();
        return;
      }
      if (t) {
        // Same stop distance on the other side.
        setTicket(newTicket(side, lastClose, priceDigits, Math.abs(t.entry - t.sl)));
        return;
      }
      drawings.cancel();
      setTicket(newTicket(side, lastClose, priceDigits));
    },
    [tradable, lastClose, priceDigits, setTicket, drawings.cancel],
  );
  const ticketMetrics = ticket
    ? positionMetrics({
        side: ticket.side,
        entry: ticket.entry,
        stop: ticket.sl,
        target: ticket.tp,
        pointValue,
        balance,
        sizing,
      })
    : null;
  const draft = useMemo<DraftLines | null>(
    () =>
      ticket && cursor !== null
        ? {
            long: ticket.side === 'long',
            entry: ticket.entry,
            sl: ticket.sl,
            tp: ticket.tp,
            lots: ticketMetrics?.lots ?? '0.00',
            at: cursor,
            title: `${ticketTitle(ticket, lastClose)} ${ticketMetrics?.lots ?? ''}`.trim(),
          }
        : null,
    [ticket, cursor, lastClose, ticketMetrics?.lots],
  );
  const onDraftMove = useCallback(
    (level: 'entry' | 'sl' | 'tp', price: number) => {
      const t = ticketRef.current;
      if (!t) return;
      // Dragging the entry away from the price turns a market ticket into a limit or stop.
      setTicket({ ...t, [level]: price, ...(level === 'entry' ? { kind: 'pending' as const } : {}) });
    },
    [setTicket],
  );
  // Same spread the fill uses: the run's override, else the instrument's default (costsFor on the server).
  const desktop = useMedia(ROOMY);
  // Phone on its side: the ticket gets a column right of the chart instead of eating its height.
  const short = useMedia(SHORT);
  // Stable, so it runs once when the phone ticket opens, not on every replay step.
  const revealTicket = useCallback((node: HTMLDivElement | null) => node?.scrollIntoView({ block: 'nearest' }), []);
  const ticketNode = ticket && (
    <OrderTicket
      ticket={ticket}
      price={lastClose}
      instrument={{ code: instrument?.code ?? 'US30', pointValue, priceDigits }}
      balance={balance}
      sizing={sizing}
      busy={placing}
      onChange={setTicket}
      onSizing={setSizing}
      onPlace={() => void placeTicket()}
      onClose={() => setTicket(null)}
      compact={!desktop && !short}
    />
  );
  const spread = initialTrading?.session.costs[instrument?.code ?? '']?.spreadPoints ?? instrument?.spreadPoints ?? '0';
  const { bid, ask } = quotes(lastClose, spread, priceDigits);
  useOrderHandles({
    chart: chartApi?.chart ?? null,
    draft,
    onDraftMove,
    orders: trading.orders,
    instrument: {
      code: instrument?.code ?? 'US30',
      pointValue: instrument?.pointValue ?? '10',
      priceDigits: instrument?.priceDigits ?? 2,
    },
    editable: cursor !== null,
    onMove: trading.modify,
  });
  const { full, toggleFull, rootRef } = useFullScreen();
  const back = useMemo(() => stepBackRule(trading.orders), [trading.orders]);
  restartBlocked.current = back.blocked ? RESTART_BLOCKED : null;
  /** Select bar on or off; it can't turn on while a trade is open or pending. */
  const pick = useCallback(
    (on: boolean) => {
      if (on && restartBlocked.current) {
        replay.notify(restartBlocked.current);
        return;
      }
      setPicking(on);
    },
    [replay.notify],
  );
  // Once the chart has settled, warm the cache for the other timeframes and instruments at the same cursor,
  // so switching is instant (same request as the chart would make; nothing past the cursor).
  const instrumentCodes = instruments.map((i) => i.code).join(',');
  useEffect(() => {
    if (playing) return;
    const t = window.setTimeout(() => {
      const until = cursor === null ? liveUntil(Date.now()) : new Date(cursor);
      const current = instrument?.code;
      for (const other of TIMEFRAMES) {
        if (other !== tf && current) prefetchBars({ instrument: current, tf: other, until, count: BARS_PAGE });
      }
      for (const code of instrumentCodes.split(',')) {
        if (code && code !== current) prefetchBars({ instrument: code, tf, until, count: BARS_PAGE });
      }
    }, PREFETCH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [cursor, playing, tf, instrument?.code, instrumentCodes]);
  const marks = useMemo(
    () => orderMarks(trading.orders, instrument?.code ?? '', tf, pointValue),
    [trading.orders, instrument?.code, tf, pointValue],
  );
  const selected = drawings.selected;
  const selectedBox = selected && (selected.tool === 'long' || selected.tool === 'short') ? selected : null;
  /**
   * A long/short box trades exactly as drawn (Joe, 26 Oct 2026): `drawn` opens now at its entry, stop and target;
   * `pending` waits for price to reach the entry as a limit or stop. Nothing is moved before or after.
   */
  const placeFromBox = useCallback(
    async (kind: 'drawn' | 'pending') => {
      const box = drawings.selected;
      if (!box || (box.tool !== 'long' && box.tool !== 'short')) return;
      const placed = await trading.place(
        { side: box.tool, points: box.points.map((p) => ({ ts: p.ts, price: p.price })), sizing: sizingRef.current },
        kind,
        box.drawingId,
      );
      // The drawing has become the order (spec §6.1).
      if (placed) drawings.removeSelected();
    },
    [drawings.selected, drawings.removeSelected, trading.place],
  );
  const boxMetrics = selectedBox
    ? positionMetrics({
        side: selectedBox.tool as Side,
        entry: selectedBox.points[0]?.price ?? 0,
        stop: selectedBox.points[1]?.price ?? 0,
        target: selectedBox.points[2]?.price ?? 0,
        pointValue,
        balance,
        sizing,
      })
    : null;
  // One listener for the page's life, always running the latest handler: re-adding it on every replay step
  // could miss a key pressed between renders (audit 25 Oct, #5).
  const onKeyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  onKeyRef.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const key = chartKeyFor(event, cursor !== null);
    if (key) {
      event.preventDefault();
      // A focused button (Play, Bar…) would also react to Space on key up and undo the toggle.
      if (target?.tagName === 'BUTTON') target.blur();
      if (key.type === 'step') void step(key.mode);
      else if (key.type === 'back') void replay.stepBack(key.mode, back);
      else if (key.type === 'play') setPlaying(!playing);
      else if (key.type === 'scroll') chartApi?.scrollBars(key.bars);
      else if (key.type === 'zoom') chartApi?.zoom(key.in);
      else if (key.type === 'reset') chartApi?.reset();
      else if (key.type === 'undo') undo();
      else redo();
      return;
    }
    if (event.altKey && !event.metaKey && !event.ctrlKey) {
      const tool = toolForKey(event.code);
      if (tool) {
        event.preventDefault();
        startTool(tool.id);
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      if (ticketRef.current) setTicket(null);
      else cancelTool();
      return;
    }
    // Shift+B / Shift+S: buy or sell ticket (again to place it); Enter places an open ticket. Plain B is
    // Select bar.
    if (event.shiftKey && (event.code === 'KeyB' || event.code === 'KeyS')) {
      event.preventDefault();
      pressSide(event.code === 'KeyB' ? 'long' : 'short');
      return;
    }
    if (event.key === 'Enter' && ticketRef.current && target?.tagName !== 'BUTTON') {
      event.preventDefault();
      void placeRef.current();
      return;
    }
    if (event.shiftKey && (event.key === 'F' || event.key === 'f')) {
      event.preventDefault();
      toggleFull();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      removeSelected();
      return;
    }
    // B toggles Select bar (Shift+B belongs to buy).
    if (!event.shiftKey && (event.key === 'b' || event.key === 'B')) {
      pick(!picking);
      return;
    }
    const next = timeframeForKey(event.key);
    if (next) void setTfParam(String(next));
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onKeyRef.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!instrument) {
    return <p className="p-4 text-muted-foreground text-sm">No instruments are set up yet.</p>;
  }

  return (
    <div
      ref={rootRef}
      className={cn('tv-dark isolate flex flex-1 flex-col md:h-full', full && 'fixed inset-0 z-50 h-dvh bg-background')}
      data-full-screen={full ? 'true' : 'false'}
    >
      {/* Landscape phone: the chart toolbar and the replay bar share one row. */}
      <div className="flex flex-col short:flex-row">
        <div
          className={cn(
            'relative z-30 flex flex-wrap items-center gap-1.5 border-b px-2 py-1 text-sm compact:py-0.5 short:shrink-0 md:px-3',
            full && 'roomy:hidden',
          )}
        >
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Instrument</legend>
            {instruments.map((i) => (
              <button
                key={i.code}
                type="button"
                aria-pressed={i.code === instrument.code}
                onClick={() => void setCode(i.code)}
                title={`${i.displayName} · ${symbolWithAlias(i.code)}`}
                className={cn(
                  'h-9 rounded-md px-3 font-semibold tracking-tight short:px-2',
                  i.code === instrument.code
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                {i.code}
              </button>
            ))}
          </fieldset>
          <Divider />
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Timeframe</legend>
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={t === tf}
                aria-keyshortcuts={t === 15 ? 'F' : String(t)}
                onClick={() => void setTfParam(String(t))}
                className={cn(
                  'h-9 min-w-11 rounded-md px-2 num short:min-w-9',
                  t === tf ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                {t}m
              </button>
            ))}
          </fieldset>
          <div className="ml-auto flex items-center gap-1 roomy:hidden">
            <button
              type="button"
              className="flex h-9 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-accent/60"
              aria-expanded={moreOpen}
              aria-controls="chart-more"
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              <span className="sr-only">Chart settings</span>
            </button>
            <FullScreenButton full={full} onToggle={toggleFull} />
          </div>
          {/* Phones (portrait or landscape): indicators, news, sessions and time fold into a panel behind the button
            above, so the toolbar stays one row. Desktop shows them inline. */}
          <div
            id="chart-more"
            className={cn(
              'roomy:contents',
              moreOpen
                ? 'absolute inset-x-0 top-full z-40 flex flex-wrap items-center gap-2 border-b bg-popover p-2 shadow-lg'
                : 'hidden',
            )}
          >
            <Divider />
            <IndicatorMenu
              prefs={prefs.indicators}
              onChange={(id, next) => {
                const merged = { ...prefs.indicators, [id]: { ...prefs.indicators[id], ...next } };
                updatePrefs({ indicators: normalisePrefs(merged) });
              }}
            />
            <Divider />
            <fieldset className="flex items-center gap-1">
              <legend className="sr-only">News markers</legend>
              <span className="flex items-center gap-1 px-1 text-muted-foreground" title="News markers">
                <Newspaper className="size-4" aria-hidden />
                <span className="sr-only md:not-sr-only">News</span>
              </span>
              {IMPACT_TOGGLES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={prefs.impacts.includes(t.id)}
                  aria-label={`${t.label} impact news`}
                  onClick={() =>
                    updatePrefs({
                      impacts: prefs.impacts.includes(t.id)
                        ? prefs.impacts.filter((i) => i !== t.id)
                        : [...prefs.impacts, t.id],
                    })
                  }
                  className={cn(
                    'h-9 rounded-md px-2',
                    prefs.impacts.includes(t.id)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60',
                  )}
                >
                  {t.label}
                </button>
              ))}
              <select
                value={prefs.allCurrencies ? 'all' : 'counted'}
                onChange={(e) => updatePrefs({ allCurrencies: e.target.value === 'all' })}
                className="h-9 rounded-md border bg-background px-1 text-foreground"
                aria-label="News currencies"
              >
                <option value="counted">{currencies.join(', ') || 'Counted'}</option>
                <option value="all">All currencies</option>
              </select>
            </fieldset>
            <div className="ml-auto flex items-center gap-2">
              <label className="flex h-9 items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={prefs.sessions}
                  onChange={(e) => updatePrefs({ sessions: e.target.checked })}
                  className="size-4"
                />
                Sessions
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                <span className="sr-only md:not-sr-only">Time</span>
                <select
                  value={prefs.timezone}
                  onChange={(e) => updatePrefs({ timezone: e.target.value })}
                  className="h-9 rounded-md border bg-background px-2 text-foreground"
                  aria-label="Chart time zone"
                >
                  {TIMEZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
              <FullScreenButton full={full} onToggle={toggleFull} className="compact:hidden" />
            </div>
            <p className="w-full px-1 text-muted-foreground text-xs roomy:hidden">{DATA_NOTE}</p>
          </div>
        </div>
        <ReplayControls
          replay={replay}
          timezone={prefs.timezone}
          data={
            instrument.dataFrom != null && instrument.dataTo != null
              ? { from: instrument.dataFrom, to: instrument.dataTo }
              : null
          }
          picking={picking}
          onPick={pick}
          back={back}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col-reverse short:flex-row md:flex-row">
        <DrawingToolbar drawings={drawings} />
        <div
          className={cn('relative min-h-0 flex-1', picking && 'cursor-crosshair')}
          data-testid="chart-area"
          data-drawings={JSON.stringify(
            drawings.shown.map((d) => ({ tool: d.tool, points: d.points, style: d.style, label: d.label })),
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex select-none items-center justify-center font-semibold text-[clamp(3rem,10vw,8rem)] text-white/[0.025] tracking-tight"
          >
            {instrument.code}
          </div>
          <NewsPanel events={hovered} timezone={prefs.timezone} />
          {trading.session && (
            // Under the price legend: Sell/Buy, and on desktop the ticket below them. On phones the ticket sits under
            // the chart, so it never hides the lines you drag.
            <div className="pointer-events-none absolute top-14 bottom-2 left-2 z-20 flex flex-col items-start gap-2 md:top-8">
              <div className="pointer-events-auto">
                <TradeButtons enabled={tradable} bid={bid} ask={ask} open={ticket?.side ?? null} onPress={pressSide} />
              </div>
              {/* A short screen (phone on its side) scrolls the ticket instead of cutting off its button. */}
              {desktop && ticketNode && <div className="pointer-events-auto min-h-0 overflow-y-auto">{ticketNode}</div>}
            </div>
          )}
          {full && (
            <div className="absolute top-2 right-16 z-20 compact:hidden">
              <FullScreenButton full={full} onToggle={toggleFull} />
            </div>
          )}
          {picking && (
            <PickBar
              placed={placed}
              timezone={prefs.timezone}
              onStart={(bar) => {
                setPicking(false);
                replay.startAtBar(bar);
              }}
              onCancel={() => setPicking(false)}
            />
          )}
          {menu && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 z-10 cursor-default"
                onClick={() => setMenu(null)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(null);
                }}
              />
              <div
                role="menu"
                className="absolute z-20 min-w-40 rounded-md border bg-popover p-1 text-sm shadow-lg"
                style={{ left: menu.x, top: menu.y }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-8 w-full items-center rounded px-2 text-left hover:bg-accent"
                  onClick={() => {
                    replay.startAtBar(menu.bar);
                    setMenu(null);
                    setPicking(false);
                  }}
                >
                  Replay from here
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-8 w-full items-center justify-between gap-4 rounded px-2 text-left hover:bg-accent"
                  onClick={() => {
                    chartApi?.reset();
                    setMenu(null);
                  }}
                >
                  Reset chart <span className="text-muted-foreground text-xs">Alt+R</span>
                </button>
              </div>
            </>
          )}
          {!ticket && (
            <DrawingProperties drawings={drawings}>
              {selectedBox && <SizeControls sizing={sizing} onSizing={setSizing} />}
              {selectedBox && cursor === null && (
                <span className="px-1 text-muted-foreground text-xs">Start replay to place it</span>
              )}
              {selectedBox && boxMetrics && trading.session && cursor !== null && (
                <>
                  <button
                    type="button"
                    disabled={!boxMetrics.valid}
                    onClick={() => void placeFromBox('drawn')}
                    title="Opens now at exactly the drawn entry, stop and target"
                    className={cn(
                      'h-8 whitespace-nowrap rounded-md px-3 font-semibold disabled:opacity-50',
                      selectedBox.tool === 'long' ? 'bg-profit text-background' : 'bg-loss text-background',
                    )}
                  >
                    <span className="num">
                      {selectedBox.tool === 'long' ? 'Buy' : 'Sell'}{' '}
                      {(selectedBox.points[0]?.price ?? 0).toFixed(priceDigits)} · {boxMetrics.lots} lots
                    </span>
                  </button>
                  {lastClose !== null && (
                    <button
                      type="button"
                      disabled={!boxMetrics.valid}
                      onClick={() => void placeFromBox('pending')}
                      title="Waits for price to reach the entry"
                      className="h-8 rounded-md px-2 hover:bg-accent/60 disabled:opacity-50"
                    >
                      {selectedBox.tool === 'long' ? 'Buy' : 'Sell'}{' '}
                      {pendingType(selectedBox.tool as Side, selectedBox.points[0]?.price ?? 0, lastClose)} order
                    </button>
                  )}
                </>
              )}
            </DrawingProperties>
          )}
          {drawings.error && (
            <p role="alert" className="absolute top-2 left-2 z-10 rounded-md bg-loss/20 px-3 py-1 text-sm">
              {drawings.error}
            </p>
          )}
          <KLineChart
            instrument={instrument}
            tf={tf}
            timezone={prefs.timezone}
            sessions={prefs.sessions}
            cursorRef={replay.cursorRef}
            reloadKey={replay.reloadKey}
            onReady={onChartReady}
            onBarClick={onBarClick}
            onBarContextMenu={onBarContextMenu}
            markers={markers}
            onCrosshair={setHoverBar}
            indicators={indicators}
            orderMarks={marks}
            picking={picking}
            onLastBar={onLastBar}
            onPickPlace={setPlaced}
          />
        </div>
        {!desktop && short && ticketNode && (
          <div className="w-60 shrink-0 overflow-y-auto border-l p-1.5" data-testid="ticket-column">
            {ticketNode}
          </div>
        )}
      </div>
      {!desktop && !short && ticketNode && (
        <div
          className="max-h-[50dvh] shrink-0 overflow-y-auto border-t p-1.5"
          // Brought into view when it opens: on a phone it sits under the chart.
          ref={revealTicket}
        >
          {ticketNode}
        </div>
      )}
      {/* Desktop full screen is the chart alone; on a phone it keeps the trades, so nothing is out of reach. */}
      <div className={cn(full && 'roomy:hidden')}>
        <TradePanel
          trading={trading}
          timezone={prefs.timezone}
          price={lastClose}
          instrument={{ code: instrument.code, pointValue, priceDigits }}
        />
      </div>
      {full && trading.error && (
        <p role="alert" className="border-t px-4 py-1 text-loss text-sm compact:hidden">
          {trading.error}
        </p>
      )}
      <p className={cn('border-t px-4 py-1 text-muted-foreground text-xs compact:hidden', full && 'hidden')}>
        {DATA_NOTE}
      </p>
    </div>
  );
}

/** Same queries as the `roomy` and `short` variants in globals.css, so the script and the CSS pick one layout. */
const ROOMY = '(width >= 48rem) and (height > 520px)';
const SHORT = '(height <= 520px)';

/** Whether a media query matches; false until mounted. */
function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Vertical separator between toolbar groups, as on TradingView's top bar. */
function Divider() {
  return <span aria-hidden className="mx-1 hidden h-6 w-px bg-border short:hidden! md:block" />;
}

/**
 * Chart-only view (Shift+F, as on TradingView): the workspace covers the app and, where the browser allows,
 * goes truly full screen. Leaving browser full screen (Esc) leaves the mode too. The choice is remembered, so a
 * phone that backtests in full screen comes back to it after a reload (the overlay only; browser full screen
 * needs a tap).
 */
function useFullScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(FULL_KEY) === '1') setFull(true);
    } catch {
      // Storage blocked: start out of full screen.
    }
  }, []);
  const remember = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(FULL_KEY, on ? '1' : '0');
    } catch {
      // Private mode: not remembered.
    }
  }, []);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) {
        setFull(false);
        remember(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [remember]);
  const fullRef = useRef(full);
  fullRef.current = full;
  const toggleFull = useCallback(() => {
    const next = !fullRef.current;
    setFull(next);
    remember(next);
    try {
      if (next) void rootRef.current?.requestFullscreen?.().catch(() => undefined);
      else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch {
      // iPhone Safari has no element full screen: the fixed layout still hides the app around the chart.
    }
  }, [remember]);
  return { full, toggleFull, rootRef };
}

function FullScreenButton({ full, onToggle, className }: { full: boolean; onToggle: () => void; className?: string }) {
  const Icon = full ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={full}
      aria-keyshortcuts="Shift+F"
      title={full ? 'Exit full screen (Shift+F)' : 'Full screen (Shift+F)'}
      className={cn(
        'flex size-9 items-center justify-center rounded-md bg-popover/80 text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{full ? 'Exit full screen' : 'Full screen'}</span>
    </button>
  );
}
