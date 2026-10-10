import { describe, expect, it } from 'vitest';
import { parseRr, parseServerTime, parseSide, priceOrNull, toDecimalString } from './fields';

describe('parseServerTime', () => {
  it('converts FundedNext server time (+03:00) to UTC', () => {
    expect(parseServerTime('2026-10-09 16:36:19', '+03:00').toISOString()).toBe('2026-10-09T13:36:19.000Z');
  });

  it('crosses midnight backwards', () => {
    expect(parseServerTime('2026-10-09 01:00:00', '+03:00').toISOString()).toBe('2026-10-08T22:00:00.000Z');
  });

  it('handles a winter +02:00 and negative offsets', () => {
    expect(parseServerTime('2026-12-01 16:30:00', '+02:00').toISOString()).toBe('2026-12-01T14:30:00.000Z');
    expect(parseServerTime('2026-12-01 09:30:00', '-05:00').toISOString()).toBe('2026-12-01T14:30:00.000Z');
  });

  it('accepts ISO strings with their own offset, ignoring the file offset', () => {
    expect(parseServerTime('2026-09-24T16:32:33+03:00', '+02:00').toISOString()).toBe('2026-09-24T13:32:33.000Z');
    expect(parseServerTime('2026-09-24T13:32:33Z', '+03:00').toISOString()).toBe('2026-09-24T13:32:33.000Z');
    expect(parseServerTime('2026-09-24T13:32:33.500-05:00', '+03:00').toISOString()).toBe('2026-09-24T18:32:33.000Z');
  });

  it('rejects malformed input', () => {
    expect(() => parseServerTime('2026-10-09T16:36:19', '+03:00')).toThrow(/Invalid server time/);
    expect(() => parseServerTime('2026-10-09 16:36:19', '3')).toThrow(/offset/);
  });
});

describe('parseRr', () => {
  it('reads the reward side of "1:x"', () => {
    expect(parseRr('1:1.03')).toBe('1.03');
    expect(parseRr('1:2')).toBe('2');
    expect(parseRr(' 1 : 0.5 ')).toBe('0.5');
  });

  it('returns null for missing or unknown formats', () => {
    expect(parseRr(null)).toBeNull();
    expect(parseRr(undefined)).toBeNull();
    expect(parseRr('')).toBeNull();
    expect(parseRr('2:1')).toBeNull();
  });
});

describe('parseSide', () => {
  it('maps 0 to buy and 1 to sell', () => {
    expect(parseSide(0)).toBe('buy');
    expect(parseSide(1)).toBe('sell');
  });
});

describe('priceOrNull / toDecimalString', () => {
  it('treats 0 as not set', () => {
    expect(priceOrNull(0)).toBeNull();
    expect(priceOrNull('0')).toBeNull();
    expect(priceOrNull(null)).toBeNull();
    expect(priceOrNull(51332.44)).toBe('51332.44');
  });

  it('keeps lots and money exact', () => {
    expect(toDecimalString('0.21')).toBe('0.21');
    expect(toDecimalString(0.1)).toBe('0.1');
    expect(toDecimalString(-129.38)).toBe('-129.38');
  });
});
