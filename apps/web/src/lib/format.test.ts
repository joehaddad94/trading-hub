import { describe, expect, it } from 'vitest';
import { formatBeirut } from './format';

describe('formatBeirut', () => {
  it('shows UTC instants in Beirut time across DST', () => {
    expect(formatBeirut(new Date('2026-10-09T21:00:00Z'))).toBe('10 Oct 2026, 00:00'); // UTC+3
    expect(formatBeirut(new Date('2026-12-09T21:00:00Z'))).toBe('9 Dec 2026, 23:00'); // UTC+2
  });
});
