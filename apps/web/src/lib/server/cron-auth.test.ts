import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ env: {} }));
const { isCronAuthorized } = await import('./cron-auth');

const SECRET = 'a-long-enough-cron-secret';

describe('isCronAuthorized', () => {
  it('accepts the exact bearer secret', () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it('refuses a missing, wrong or differently sized header', () => {
    expect(isCronAuthorized(null, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET.replace('a', 'b')}`, SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
  });

  it('refuses everything when no secret is configured', () => {
    expect(isCronAuthorized('Bearer ', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false);
  });
});
