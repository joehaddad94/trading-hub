'use client';

import { parseTimeframe, TIMEFRAMES, type Timeframe } from '@trading/backtest-engine';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { KLineChart } from './kline-chart';
import { NewsPanel } from './news-panel';
import { ReplayControls } from './replay-controls';
import { eventsInBar, type NewsFilter, toMarkers, useNewsEvents } from './use-news-events';
import { useReplay } from './use-replay';

export type WorkspaceInstrument = { code: string; displayName: string; priceDigits: number };

const TIMEZONES = [
  { id: 'Asia/Beirut', label: 'Beirut' },
  { id: 'America/New_York', label: 'New York' },
] as const;

const PREFS_KEY = 'backtest.chart';
type Impact = NewsFilter['impacts'][number];
type Prefs = { timezone: string; sessions: boolean; impacts: Impact[]; allCurrencies: boolean };
const DEFAULT_PREFS: Prefs = { timezone: 'Asia/Beirut', sessions: true, impacts: ['high'], allCurrencies: false };
const IMPACT_TOGGLES: { id: Impact; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Med' },
  { id: 'low', label: 'Low' },
];

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
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
}: {
  instruments: WorkspaceInstrument[];
  /** News › "currencies that count": the default marker filter. */
  currencies: string[];
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
  const onBarClick = useCallback(
    (barStart: number) => {
      if (!picking) return;
      setPicking(false);
      replay.startAtBar(barStart);
    },
    [picking, replay.startAtBar],
  );

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
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  const filter = useMemo<NewsFilter>(
    () => ({ impacts: prefs.impacts, currencies: prefs.allCurrencies ? [] : currencies }),
    [prefs.impacts, prefs.allCurrencies, currencies],
  );
  const events = useNewsEvents(cursor, filter, prefs.impacts.length > 0);
  const markers = useMemo(() => toMarkers(events, tf), [events, tf]);
  const hovered = eventsInBar(events, hoverBar, tf, cursor);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
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
  }, [setTfParam, cursor, step, setPlaying, playing]);

  if (!instrument) {
    return <p className="p-4 text-muted-foreground text-sm">No instruments are set up yet.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-sm md:px-4">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Instrument</legend>
          {instruments.map((i) => (
            <button
              key={i.code}
              type="button"
              aria-pressed={i.code === instrument.code}
              onClick={() => void setCode(i.code)}
              title={i.displayName}
              className={cn(
                'h-9 rounded-md px-3 font-medium',
                i.code === instrument.code
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {i.code}
            </button>
          ))}
        </fieldset>
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
                'h-9 min-w-11 rounded-md px-2 tabular-nums',
                t === tf ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {t}m
            </button>
          ))}
        </fieldset>
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">News markers</legend>
          <span className="text-muted-foreground">News</span>
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
      <div className={cn('relative min-h-0 flex-1', picking && 'cursor-crosshair')}>
        <NewsPanel events={hovered} timezone={prefs.timezone} />
        <KLineChart
          instrument={instrument}
          tf={tf}
          timezone={prefs.timezone}
          sessions={prefs.sessions}
          cursorRef={replay.cursorRef}
          reloadKey={replay.reloadKey}
          onReady={replay.onChartReady}
          onBarClick={onBarClick}
          markers={markers}
          onCrosshair={setHoverBar}
        />
      </div>
      <p className="border-t px-4 py-1 text-muted-foreground text-xs">
        Historical data from Dukascopy; prices may differ slightly from your broker.
      </p>
    </div>
  );
}
