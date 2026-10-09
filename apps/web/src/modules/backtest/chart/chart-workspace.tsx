'use client';

import { parseTimeframe, TIMEFRAMES, type Timeframe } from '@trading/backtest-engine';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { KLineChart } from './kline-chart';

export type WorkspaceInstrument = { code: string; displayName: string; priceDigits: number };

const TIMEZONES = [
  { id: 'Asia/Beirut', label: 'Beirut' },
  { id: 'America/New_York', label: 'New York' },
] as const;

const PREFS_KEY = 'backtest.chart';
type Prefs = { timezone: string; sessions: boolean };
const DEFAULT_PREFS: Prefs = { timezone: 'Asia/Beirut', sessions: true };

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

/** Backtest Lab chart: instrument switch, 1m/5m/15m, session shading, Beirut or New York time. */
export function ChartWorkspace({ instruments }: { instruments: WorkspaceInstrument[] }) {
  const [code, setCode] = useQueryState('i', parseAsString.withDefault(defaultInstrument(instruments)));
  const [tfParam, setTfParam] = useQueryState('tf', parseAsString.withDefault('5'));
  const tf = parseTimeframe(tfParam) ?? 5;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const instrument = instruments.find((i) => i.code === code) ?? instruments[0];

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const next = timeframeForKey(event.key);
      if (next) void setTfParam(String(next));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTfParam]);

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
      <div className="min-h-0 flex-1">
        <KLineChart instrument={instrument} tf={tf} timezone={prefs.timezone} sessions={prefs.sessions} />
      </div>
      <p className="border-t px-4 py-1 text-muted-foreground text-xs">
        Historical data from Dukascopy; prices may differ slightly from your broker.
      </p>
    </div>
  );
}
