import { TZDate } from '@date-fns/tz';

/**
 * Trading hours of the US index CFDs (US30, NAS100) in Dukascopy's data: Sunday 18:00 ET → Friday 16:15 ET,
 * with a daily break 16:15–18:00 ET (the CFDs stop at the cash-index close + 15 min, before CME's 17:00 halt;
 * every weekday of the 2-year real backfill has exactly that 20:15–21:00 UTC hole). Evaluated in America/New_York so
 * DST moves with the market. Holidays are handled leniently (spec §1.3: don't alert on expected gaps):
 * on any US market holiday or early-close day, no minute of that ET date is "expected".
 */
export const MARKET_TZ = 'America/New_York';

const OPEN_MINUTE = 18 * 60;
const CLOSE_MINUTE = 16 * 60 + 15;

export function isMarketOpen(minute: Date): boolean {
  const et = new TZDate(minute.getTime(), MARKET_TZ);
  if (isReducedDay(et.getFullYear(), et.getMonth(), et.getDate())) return false;
  return isTradingHours(minute);
}

/**
 * The weekly schedule alone, holidays ignored: the replay start panel disables days with no trading hours, but
 * keeps holidays pickable (they often have a short session) and lets the replay move to the next real candle.
 */
export function isTradingHours(minute: Date): boolean {
  const et = new TZDate(minute.getTime(), MARKET_TZ);
  const day = et.getDay();
  const m = et.getHours() * 60 + et.getMinutes();
  if (day === 6) return false;
  if (day === 0) return m >= OPEN_MINUTE;
  if (day === 5) return m < CLOSE_MINUTE;
  return m < CLOSE_MINUTE || m >= OPEN_MINUTE;
}

/** Number of minutes in [from, to) the market is expected to trade. */
export function expectedMinutes(from: Date, to: Date): number {
  let count = 0;
  for (let t = from.getTime(); t < to.getTime(); t += 60_000) if (isMarketOpen(new Date(t))) count += 1;
  return count;
}

const cache = new Map<number, Set<string>>();

/** US holidays and early-close days that move index futures hours, as `month-day` keys (month 0-based). */
export function reducedDays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const days: [number, number][] = [
    [0, 1], // New Year's Day
    [0, nthWeekday(year, 0, 1, 3)], // Martin Luther King Jr. Day
    [1, nthWeekday(year, 1, 1, 3)], // Presidents' Day
    goodFriday(year),
    [4, lastWeekday(year, 4, 1)], // Memorial Day
    [5, 19], // Juneteenth
    [6, 3],
    [6, 4], // Independence Day (and the early close the day before)
    [8, nthWeekday(year, 8, 1, 1)], // Labor Day
    [10, nthWeekday(year, 10, 4, 4)], // Thanksgiving
    [10, nthWeekday(year, 10, 4, 4) + 1], // Black Friday early close
    [11, 24],
    [11, 25],
    [11, 31],
  ];
  const set = new Set(days.map(([m, d]) => `${m}-${d}`));
  cache.set(year, set);
  return set;
}

export function isReducedDay(year: number, month: number, day: number): boolean {
  return reducedDays(year).has(`${month}-${day}`);
}

/** nth (1-based) weekday (0 = Sunday) of a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(year: number, month: number, weekday: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
}

/** Anonymous Gregorian algorithm for Easter Sunday, minus two days. */
export function goodFriday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const friday = new Date(Date.UTC(year, month, day - 2));
  return [friday.getUTCMonth(), friday.getUTCDate()];
}
