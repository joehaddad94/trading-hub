import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from './allowed-email';

describe('isAllowedEmail', () => {
  const allowed = 'owner@example.com';

  it('accepts the allowed email regardless of case and whitespace', () => {
    expect(isAllowedEmail('Owner@Example.com ', allowed)).toBe(true);
  });

  it('refuses any other email', () => {
    expect(isAllowedEmail('owner@example.co', allowed)).toBe(false);
    expect(isAllowedEmail('someone@example.com', allowed)).toBe(false);
  });

  it('refuses a missing email', () => {
    expect(isAllowedEmail(undefined, allowed)).toBe(false);
    expect(isAllowedEmail(null, allowed)).toBe(false);
    expect(isAllowedEmail('', allowed)).toBe(false);
  });
});
