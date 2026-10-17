'use client';

import type { Drawing, OrderView, SessionView } from '@trading/backtest';
import { parseTimeframe, TIMEFRAMES, type Timeframe } from '@trading/backtest-engine';
import { Newspaper } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { symbolWithAlias } from '@/lib/symbols';
import { cn } from '@/lib/utils';
import { DrawingProperties, DrawingToolbar } from './drawing-toolbar';
import { IndicatorMenu } from './indicator-menu';
import { activeIndicators, type IndicatorPrefs, normalisePrefs } from './indicators';
import { type ChartApi, KLineChart } from './kline-chart';
import { NewsPanel } from './news-panel';
import { orderMarks } from './order-lines';
import { ReplayControls } from './replay-controls';
import { toolForKey } from './tools/registry';
import { TradePanel } from './trade-panel';
import { type DrawingActions, useDrawings } from './use-drawings';
import { eventsInBar, type NewsFilter, toMarkers, useNewsEvents } from './use-news-events';
import { useReplay } from './use-replay';
import { type TradingActions, useTrading } from './use-trading';

export type WorkspaceInstrument = { code: string; displayName: string; priceDigits: number; pointValue: string };

/** Position sizing balance until backtest sessions carry their own (M21). */
const DEFAULT_BALANCE = '25000';

const TIMEZONES = [
  { id: 'Asia/Beirut', label: 'Beirut' },
  { id: 'America/New_York', label: 'New York' },
] as const;

const PREFS_KEY = 'backtest.chart';
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
  const onCursor = useCallback(
    (cursor: number | null) => void setAt(cursor === null ? null : new Date(cursor).toISOString()),
    [setAt],
  );
  const replay = useReplay({
    instrument: instrument?.code ?? 'US30',
    tf,
    initialCursor: at && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : null,
    onCursor,
  });
  const [chartApi, setChartApi] = useState<ChartApi | null>(null);
  const onChartReady = useCallback(
    (api: ChartApi | null) => {
      replay.onChartReady(api);
      setChartApi(api);
    },
    [replay.onChartReady],
  );
  const drawings = useDrawings(
    chartApi?.chart ?? null,
    {
      instrument: instrument?.code ?? 'US30',
      pointValue: instrument?.pointValue ?? '10',
      priceDigits: instrument?.priceDigits ?? 2,
      tf,
      balance: initialTrading?.session.startingBalance ?? DEFAULT_BALANCE,
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
  const onBarContextMenu = useCallback((bar: number, at: { x: number; y: number }) => setMenu({ bar, ...at }), []);
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
  const { start: startTool, cancel: cancelTool, removeSelected } = drawings;
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
  const marks = useMemo(
    () => orderMarks(trading.orders, instrument?.code ?? '', tf),
    [trading.orders, instrument?.code, tf],
  );
  const selected = drawings.selected;
  const placeFromSelected = async (kind: 'market' | 'pending') => {
    if (!selected || (selected.tool !== 'long' && selected.tool !== 'short')) return;
    const placed = await trading.place(
      {
        side: selected.tool,
        points: selected.points.map((p) => ({ ts: p.ts, price: p.price })),
        sizing: selected.style.sizing,
      },
      kind,
      selected.drawingId,
    );
    // The drawing has become the order (spec §6.1).
    if (placed) drawings.removeSelected();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
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
        cancelTool();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        removeSelected();
        return;
      }
      if (cursor !== null && event.key === 'ArrowRight') {
        event.preventDefault();
        void step(event.shiftKey ? 'minute' : 'bar');
        return;
      }
      if (cursor !== null && event.key === ' ') {
        event.preventDefault();
        setPlaying(!playing);
        return;
      }
      const next = timeframeForKey(event.key);
      if (next) void setTfParam(String(next));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTfParam, cursor, step, setPlaying, playing, startTool, cancelTool, removeSelected]);

  if (!instrument) {
    return <p className="p-4 text-muted-foreground text-sm">No instruments are set up yet.</p>;
  }

  return (
    <div className="tv-dark flex flex-1 flex-col md:h-full">
      <div className="relative z-30 flex flex-wrap items-center gap-1.5 border-b px-2 py-1 text-sm md:px-3">
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
                'h-9 rounded-md px-3 font-semibold tracking-tight',
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
                'h-9 min-w-11 rounded-md px-2 num',
                t === tf ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {t}m
            </button>
          ))}
        </fieldset>
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
        </div>
      </div>
      <ReplayControls replay={replay} timezone={prefs.timezone} picking={picking} onPick={setPicking} />
      <div className="flex min-h-[60dvh] flex-1 flex-col-reverse md:min-h-0 md:flex-row">
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
          {picking && (
            <p
              role="status"
              className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-popover px-3 py-1 text-xs shadow"
              data-testid="replay-pick-hint"
            >
              Click a candle to start replay · Esc to cancel
            </p>
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
              </div>
            </>
          )}
          <DrawingProperties drawings={drawings}>
            {cursor !== null && selected && (selected.tool === 'long' || selected.tool === 'short') && (
              <>
                <button
                  type="button"
                  onClick={() => void placeFromSelected('market')}
                  className={cn(
                    'h-8 rounded-md px-2 font-medium',
                    selected.tool === 'long' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss',
                  )}
                >
                  {selected.tool === 'long' ? 'Buy market' : 'Sell market'}
                </button>
                <button
                  type="button"
                  onClick={() => void placeFromSelected('pending')}
                  className="h-8 rounded-md px-2 hover:bg-accent/60"
                >
                  Place pending
                </button>
              </>
            )}
          </DrawingProperties>
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
          />
        </div>
      </div>
      <TradePanel trading={trading} timezone={prefs.timezone} />
      <p className="border-t px-4 py-1 text-muted-foreground text-xs">
        Historical data from Dukascopy; prices may differ slightly from your broker.
      </p>
    </div>
  );
}

/** Vertical separator between toolbar groups, as on TradingView's top bar. */
function Divider() {
  return <span aria-hidden className="mx-1 hidden h-6 w-px bg-border md:block" />;
}
