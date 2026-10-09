import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { formatBeirut, formatMoney, formatPct } from './format';

describe('formatBeirut', () => {
  it('shows UTC instants in Beirut time across DST', () => {
    expect(formatBeirut(new Date('2026-10-09T21:00:00Z'))).toBe('10 Oct 2026, 00:00'); // UTC+3
    expect(formatBeirut(new Date('2026-12-09T21:00:00Z'))).toBe('9 Dec 2026, 23:00'); // UTC+2
  });
});

describe('formatMoney / formatPct', () => {
  it('formats decimals without floats', () => {
    expect(formatMoney(new Decimal('1234567.891'))).toBe('$1,234,567.89');
    expect(formatMoney('-122.29')).toBe('-$122.29');
    expect(formatMoney('-0.00')).toBe('$0.00');
    expect(formatMoney('5')).toBe('$5.00');
  });

  it('formats ratios as percentages', () => {
    expect(formatPct(new Decimal(12).div(34))).toBe('35.29%');
    expect(formatPct(null)).toBe('—');
  });
});
