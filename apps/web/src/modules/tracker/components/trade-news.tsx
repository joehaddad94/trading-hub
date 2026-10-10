import { IMPACT_COLOURS } from '@trading/core';
import type { TradeNews } from '@trading/tracker/server';
import { formatBeirut } from '@/lib/format';

const rel = (m: number) => (m === 0 ? 'at the release' : `${Math.abs(m)} min ${m < 0 ? 'before' : 'after'}`);

/** "News around this trade" (news spec §4) with the restriction-window badge (§5). */
export function TradeNewsSection({ news }: { news: TradeNews }) {
  return (
    <section
      aria-label="News around this trade"
      className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
      data-testid="trade-news"
    >
      <h3 className="flex flex-wrap items-center gap-2 font-medium">
        News around this trade
        {news.inRestrictionWindow && (
          <span className="rounded bg-amber-500/20 px-1.5 text-amber-500 text-xs" data-testid="restriction-badge">
            ⚠️ Inside a restriction window ({news.window.minutesBefore}/{news.window.minutesAfter} min)
          </span>
        )}
      </h3>
      {news.events.length === 0 ? (
        <p className="text-muted-foreground">No news within 60 minutes.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {news.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{formatBeirut(e.eventAt, 'HH:mm')}</span>
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: IMPACT_COLOURS[e.impact] }} />
              <span className="font-medium">{e.currency}</span>
              <span>{e.title}</span>
              {e.isRestricted && <span title="Restricted">🔒</span>}
              <span className="text-muted-foreground text-xs">
                opened {rel(e.minutesFromOpen)} · closed {rel(e.minutesFromClose)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!news.restrictionApplies && news.events.some((e) => e.isRestricted) && (
        <p className="text-muted-foreground text-xs">
          Restriction windows don&apos;t apply to this account (Restriction rules in News).
        </p>
      )}
    </section>
  );
}
