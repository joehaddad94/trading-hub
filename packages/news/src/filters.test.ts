import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, parseNewsFilters, serializeNewsFilters } from './filters';

describe('news filters', () => {
  it('defaults to high impact USD', () => {
    expect(parseNewsFilters({})).toEqual(DEFAULT_FILTERS);
    expect(parseNewsFilters({ impact: '', currency: 'xx1' })).toEqual(DEFAULT_FILTERS);
  });

  it('parses chips and the restricted toggle, dropping junk', () => {
    expect(parseNewsFilters({ impact: 'high,medium,bogus', currency: 'usd,EUR,usd', restricted: '1' })).toEqual({
      impacts: ['high', 'medium'],
      currencies: ['USD', 'EUR'],
      restrictedOnly: true,
    });
  });

  it('round-trips and leaves defaults out', () => {
    expect(serializeNewsFilters(DEFAULT_FILTERS)).toEqual({ impact: null, currency: null, restricted: null });
    const f = { impacts: ['medium' as const, 'high' as const], currencies: ['GBP'], restrictedOnly: true };
    const q = serializeNewsFilters(f);
    expect(q).toEqual({ impact: 'medium,high', currency: 'GBP', restricted: '1' });
    expect(parseNewsFilters(q)).toEqual(f);
  });
});
