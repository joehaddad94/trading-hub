import { describe, expect, it } from 'vitest';
import { formatCursor, localInputToUtc, utcToLocalInput } from './replay-time';

describe('replay time inputs', () => {
  it('reads the picker in the chart time zone', () => {
    expect(localInputToUtc('2026-10-07T17:37', 'Asia/Beirut')).toBe(Date.parse('2026-10-07T14:37:00Z'));
    expect(localInputToUtc('2026-10-07T10:37', 'America/New_York')).toBe(Date.parse('2026-10-07T14:37:00Z'));
    expect(localInputToUtc('nope', 'Asia/Beirut')).toBeNull();
  });

  it('writes and formats in the chart time zone', () => {
    const ms = Date.parse('2026-10-07T14:37:00Z');
    expect(utcToLocalInput(ms, 'Asia/Beirut')).toBe('2026-10-07T17:37');
    expect(formatCursor(ms, 'America/New_York')).toBe('Wed 7 Oct 2026 10:37');
  });
});
