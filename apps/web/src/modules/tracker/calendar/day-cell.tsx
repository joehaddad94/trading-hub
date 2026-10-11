'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type DayCellPreview = {
  wl: string;
  trades: { key: string; account: string; symbol: string; side: string; net: string; r: string }[];
  more: number;
};

export type DayCellProps = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  selected: boolean;
  href: string;
  value: string | null;
  valueShort: string | null;
  sub: string | null;
  tone: 'win' | 'loss' | 'flat' | null;
  intensity: number;
  icons: { news: boolean; journaled: boolean; warning: boolean; status: boolean };
  dots: string[];
  preview: DayCellPreview | null;
  /** Where the preview anchors so it never leaves the screen. */
  align: 'start' | 'center' | 'end';
  /** A day in an empty future week: a thin row with just the date (audit U5). */
  compact?: boolean;
};

const LONG_PRESS_MS = 450;

/** One calendar day (§8.2). Desktop: hover shows the preview. Phone: long-press shows it, tap opens the day. */
export function DayCell(props: DayCellProps) {
  const {
    date,
    day,
    inMonth,
    isToday,
    selected,
    href,
    value,
    valueShort,
    sub,
    tone,
    intensity,
    icons,
    dots,
    preview,
    align,
    compact = false,
  } = props;
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);

  const background =
    tone === 'win'
      ? `rgb(62 207 142 / ${0.1 + 0.38 * intensity})`
      : tone === 'loss'
        ? `rgb(255 141 161 / ${0.1 + 0.38 * intensity})`
        : undefined;

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div className="@container relative min-w-0">
      <Link
        href={href as Route}
        scroll={false}
        data-testid={`day-${date}`}
        aria-label={`${date}${value ? `, ${value}${sub ? `, ${sub}` : ''}` : ', no trades'}${icons.news ? ', red-folder news' : ''}`}
        aria-current={selected ? 'date' : undefined}
        className={cn(
          'flex min-w-0 flex-col justify-between overflow-hidden rounded-md border p-1 text-left md:p-2',
          compact ? 'h-8 md:h-9 md:py-1' : 'h-16 md:h-24',
          !inMonth && 'opacity-40',
          tone === null && 'border-transparent bg-muted/30',
          selected && 'ring-2 ring-foreground',
        )}
        style={background ? { backgroundColor: background } : undefined}
        onMouseEnter={() => preview && setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => preview && setOpen(true)}
        onBlur={() => setOpen(false)}
        onPointerDown={(e) => {
          if (!preview || e.pointerType === 'mouse') return;
          pressed.current = false;
          timer.current = setTimeout(() => {
            pressed.current = true;
            setOpen(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => preview && e.preventDefault()}
        onClick={(e) => {
          if (pressed.current) {
            e.preventDefault();
            pressed.current = false;
          }
        }}
      >
        <div className="flex items-start justify-between gap-0.5">
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded text-[11px] num md:text-xs',
              isToday && 'border border-foreground font-semibold',
            )}
          >
            {day}
          </span>
          <span className="flex gap-px text-[9px] leading-none md:text-xs" aria-hidden>
            {icons.journaled && <span title="Journaled">📝</span>}
            {icons.warning && <span title="Close to a rule limit">⚠️</span>}
            {icons.status && <span title="Account status changed">🔄</span>}
          </span>
        </div>
        {value && (
          <div className="min-w-0">
            <div
              className={cn(
                'truncate font-semibold text-[11px] num md:text-sm',
                tone === 'win' && 'text-[#d2f7e4]',
                tone === 'loss' && 'text-[#ffdbe1]',
              )}
            >
              {/* Full value only when the cell is wide enough (phone, or Overview beside an open day). */}
              <span className="@[5rem]:hidden">{valueShort ?? value}</span>
              <span className="hidden @[5rem]:inline">{value}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="truncate text-[10px] text-muted-foreground md:text-xs">{sub}</span>
              {dots.length > 1 && (
                <span className="ml-auto flex gap-0.5" aria-hidden>
                  {dots.map((c) => (
                    <span key={c} className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}
      </Link>
      {/* Red-folder news day (audit U12): a corner flag, readable at a glance where the old icon wasn't. */}
      {icons.news && (
        <span
          aria-hidden
          title="Red-folder news"
          data-testid="news-flag"
          className="pointer-events-none absolute top-0 right-0 size-0 rounded-tr-md border-t-[14px] border-t-loss border-l-[14px] border-l-transparent md:border-t-[18px] md:border-l-[18px]"
        />
      )}
      {open && preview && (
        <div
          role="tooltip"
          className={cn(
            'absolute top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-2 text-xs shadow-lg',
            align === 'start' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'end' && 'right-0',
          )}
          onPointerDown={() => setOpen(false)}
        >
          <p className="mb-1 text-muted-foreground">{preview.wl}</p>
          <ul className="flex flex-col gap-1">
            {preview.trades.map((t) => (
              <li key={t.key} className="flex justify-between gap-2 num">
                <span className="truncate">
                  {t.account} · {t.symbol} {t.side}
                </span>
                <span className="shrink-0">
                  {t.net} · {t.r}
                </span>
              </li>
            ))}
          </ul>
          {preview.more > 0 && <p className="mt-1 text-muted-foreground">+{preview.more} more</p>}
        </div>
      )}
    </div>
  );
}
