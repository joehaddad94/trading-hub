import { describe, expect, it } from 'vitest';
import { initialPick } from './replay-start-panel';
import { formatCursor, formatCursorShort } from './replay-time';

const BEIRUT = 'Asia/Beirut';
// Sat 24 Oct 2026 12:00 UTC.
const NOW = Date.parse('2026-10-24T12:00:00Z');
const DATA = { from: Date.parse('2024-10-14T00:00:00Z'), to: Date.parse('2026-10-23T20:00:00Z') };

describe('replay time', () => {
  it('formats in the chart time zone', () => {
    const ms = Date.parse('2026-10-07T14:37:00Z');
    expect(formatCursor(ms, 'America/New_York')).toBe('Wed 7 Oct 2026 10:37');
    expect(formatCursor(ms, BEIRUT)).toBe('Wed 7 Oct 2026 17:37');
    expect(formatCursorShort(ms, BEIRUT)).toBe('7 Oct 17:37');
  });
});

describe('initialPick', () => {
  it('opens a fresh panel on the NY AM open of the last trading day', () => {
    // Yesterday was Friday 23 Oct; NY AM opens 16:30 Beirut.
    expect(initialPick(null, null, BEIRUT, DATA, NOW)).toEqual({ day: { y: 2026, m: 10, d: 23 }, minute: 990 });
  });

  it('opens on the last start, so a second pick keeps the date and the time', () => {
    const last = Date.parse('2026-10-13T07:15:00Z'); // 10:15 Beirut
    expect(initialPick(last, null, BEIRUT, DATA, NOW)).toEqual({ day: { y: 2026, m: 10, d: 13 }, minute: 615 });
    // Mid-replay from that start, a few hours on.
    expect(initialPick(last, last + 4 * 3_600_000, BEIRUT, DATA, NOW)?.minute).toBe(615);
  });

  it('uses the cursor when the replay did not come from the last start', () => {
    const last = Date.parse('2026-10-13T07:15:00Z');
    const cursor = Date.parse('2026-09-02T14:00:00Z'); // 17:00 Beirut, opened from a link
    expect(initialPick(last, cursor, BEIRUT, DATA, NOW)).toEqual({ day: { y: 2026, m: 9, d: 2 }, minute: 1020 });
  });
});
