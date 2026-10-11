import { describe, expect, it } from 'vitest';
import { formatPrice, symbolWithAlias } from './symbols';

describe('formatPrice', () => {
  it('trims exported zeros but keeps two decimals and real precision', () => {
    expect(formatPrice('30778.00000')).toBe('30778.00');
    expect(formatPrice('51429.60000')).toBe('51429.60');
    expect(formatPrice('1.08534')).toBe('1.08534');
    expect(formatPrice('42')).toBe('42.00');
    expect(formatPrice(null)).toBe('—');
  });
});

describe('symbolWithAlias', () => {
  it('names both codes of the Nasdaq index', () => {
    expect(symbolWithAlias('NDX100')).toBe('NDX100 (NAS100)');
    expect(symbolWithAlias('NAS100')).toBe('NAS100 (NDX100)');
    expect(symbolWithAlias('US30')).toBe('US30');
  });
});
