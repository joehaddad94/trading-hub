import { describe, expect, it } from 'vitest';
import { defaultReplayStart, formatCursor } from './replay-time';

describe('replay time', () => {
  it('formats in the chart time zone', () => {
    const ms = Date.parse('2026-10-07T14:37:00Z');
    expect(formatCursor(ms, 'America/New_York')).toBe('Wed 7 Oct 2026 10:37');
    expect(formatCursor(ms, 'Asia/Beirut')).toBe('Wed 7 Oct 2026 17:37');
  });

  it('defaults the start panel to one week back, on the hour', () => {
    expect(defaultReplayStart(Date.parse('2026-10-21T12:42:27Z'))).toBe(Date.parse('2026-10-14T12:00:00Z'));
  });
});
