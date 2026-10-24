import { describe, expect, it } from 'vitest';
import { dayBlocked, dayHasMarket, monthGrid, pickTime, randomStart, resolveStart, zonesOnDay } from './replay-start';

const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();
const BEIRUT = 'Asia/Beirut';
const NY = 'America/New_York';
// Sat 24 Oct 2026 21:00 UTC.
const NOW = at('2026-10-24T21:00:00Z');

/** The weekly schedule as `@trading/market-data` has it: Sunday 18:00 to Friday 16:15 ET, break 16:15–18:00. */
function isOpen(minute: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(minute);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = get('weekday');
  const m = Number(get('hour')) * 60 + Number(get('minute'));
  if (day === 'Sat') return false;
  if (day === 'Sun') return m >= 18 * 60;
  if (day === 'Fri') return m < 16 * 60 + 15;
  return m < 16 * 60 + 15 || m >= 18 * 60;
}

describe('market hours', () => {
  it('closes all of Saturday and Sunday in Beirut, but Sunday evening trades in New York', () => {
    expect(dayHasMarket({ y: 2026, m: 10, d: 10 }, BEIRUT, isOpen)).toBe(false);
    expect(dayHasMarket({ y: 2026, m: 10, d: 11 }, BEIRUT, isOpen)).toBe(false);
    expect(dayHasMarket({ y: 2026, m: 10, d: 12 }, BEIRUT, isOpen)).toBe(true);
    expect(dayHasMarket({ y: 2026, m: 10, d: 11 }, NY, isOpen)).toBe(true);
    expect(dayHasMarket({ y: 2026, m: 10, d: 10 }, NY, isOpen)).toBe(false);
  });

  it('blocks closed, future and no-data days and says why', () => {
    const data = { from: at('2024-10-14T00:00:00Z'), to: at('2026-10-23T20:59:00Z') };
    expect(dayBlocked({ y: 2026, m: 10, d: 7 }, BEIRUT, data, NOW, isOpen)).toBeNull();
    expect(dayBlocked({ y: 2026, m: 10, d: 10 }, BEIRUT, data, NOW, isOpen)).toBe('Market closed');
    expect(dayBlocked({ y: 2026, m: 10, d: 26 }, BEIRUT, data, NOW, isOpen)).toBe('In the future');
    expect(dayBlocked({ y: 2024, m: 10, d: 11 }, BEIRUT, data, NOW, isOpen)).toBe('No candles on this day');
  });
});

describe('monthGrid', () => {
  it('starts on Monday', () => {
    const grid = monthGrid(2026, 10); // 1 Oct 2026 is a Thursday
    expect(grid.slice(0, 3)).toEqual([null, null, null]);
    expect(grid[3]).toEqual({ y: 2026, m: 10, d: 1 });
    expect(grid.length).toBe(3 + 31);
  });
});

describe('zonesOnDay', () => {
  it('lists the kill zones opening on a Beirut day, Asia from the NY evening before', () => {
    const zones = zonesOnDay({ y: 2026, m: 10, d: 7 }, BEIRUT).map((z) => [z.name, iso(z.at)]);
    expect(zones).toEqual([
      ['asia', '2026-10-07T00:00:00.000Z'], // 03:00 Beirut = Tue 20:00 NY
      ['london', '2026-10-07T06:00:00.000Z'],
      ['ny_am', '2026-10-07T13:30:00.000Z'], // 16:30 Beirut
      ['ny_pm', '2026-10-07T17:30:00.000Z'],
    ]);
  });

  it('follows each clock change: Beirut moves back on 25 Oct, New York on 1 Nov', () => {
    const am = (d: number) => zonesOnDay({ y: 2026, m: 10, d }, BEIRUT).find((z) => z.name === 'ny_am')?.at ?? 0;
    expect(new Date(am(23) + 3 * 3_600_000).toISOString().slice(11, 16)).toBe('16:30');
    expect(new Date(am(27) + 2 * 3_600_000).toISOString().slice(11, 16)).toBe('15:30');
  });

  it('lists London to Asia on a New York day', () => {
    expect(zonesOnDay({ y: 2026, m: 10, d: 7 }, NY).map((z) => z.name)).toEqual(['london', 'ny_am', 'ny_pm', 'asia']);
  });
});

describe('pickTime and resolveStart', () => {
  it('turns a pick into its kill-zone open', () => {
    expect(iso(pickTime({ day: { y: 2026, m: 10, d: 7 }, zone: 'ny_am' }, BEIRUT) ?? 0)).toBe(
      '2026-10-07T13:30:00.000Z',
    );
  });

  it('parks one minute before the first candle and flags a closed market', () => {
    const open = at('2026-10-07T13:30:00Z');
    expect(resolveStart(open, open)).toEqual({ cursor: open - 60_000, snapped: false });
    // Thanksgiving-style gap: the zone opens, the next candle is the evening reopen.
    const reopen = at('2026-10-07T22:00:00Z');
    expect(resolveStart(open, reopen)).toEqual({ cursor: reopen - 60_000, snapped: true });
    expect(resolveStart(open, null)).toBeNull();
  });
});

describe('randomStart', () => {
  it('picks a kill-zone open on a trading day inside the data', () => {
    const from = at('2026-10-05T00:00:00Z');
    const to = at('2026-10-23T20:00:00Z');
    let seed = 0.37;
    const rand = () => {
      seed = (seed * 9301 + 0.49297) % 1;
      return seed;
    };
    for (let i = 0; i < 20; i += 1) {
      const pick = randomStart(from, to, rand, BEIRUT, isOpen);
      if (!pick) throw new Error('no pick');
      const t = pickTime(pick, BEIRUT) ?? 0;
      expect(pick.zone).not.toBeNull();
      expect(isOpen(new Date(t))).toBe(true);
      expect(t).toBeGreaterThanOrEqual(from);
      expect(t).toBeLessThan(to);
    }
    expect(randomStart(from, from + 1000, rand, BEIRUT, isOpen)).toBeNull();
  });
});
