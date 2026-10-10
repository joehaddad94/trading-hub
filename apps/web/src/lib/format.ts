import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** Display timezone (CLAUDE.md rule 6): store UTC, show Asia/Beirut. */
export const DISPLAY_TZ = 'Asia/Beirut';

export function formatBeirut(date: Date, pattern = 'd MMM yyyy, HH:mm'): string {
  return format(new TZDate(date, DISPLAY_TZ), pattern);
}

/** `$1,234.56` / `-$12.00`. Takes Decimals or decimal strings — never floats (CLAUDE.md rule 5). */
export function formatMoney(value: { toFixed(dp: number): string } | string): string {
  const fixed = typeof value === 'string' ? value : value.toFixed(2);
  const negative = fixed.startsWith('-');
  const [int = '0', frac = '00'] = (negative ? fixed.slice(1) : fixed).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `$${grouped}.${frac.padEnd(2, '0').slice(0, 2)}`;
  return negative && body !== '$0.00' ? `-${body}` : body;
}

/** A ratio (0.3529) as `35.29%`; `—` when undefined. */
export function formatPct(ratio: { times(n: number): { toFixed(dp: number): string } } | null): string {
  return ratio ? `${ratio.times(100).toFixed(2)}%` : '—';
}

/** An R multiple as `+1.25R` / `-0.80R`; `—` when unknown. */
export const formatR = (r: { gte(n: number): boolean; toFixed(dp: number): string } | null) =>
  r ? `${r.gte(0) ? '+' : ''}${r.toFixed(2)}R` : '—';
