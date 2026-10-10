import { describe, expect, it } from 'vitest';
import { type DedupeEvent, newsRange, resolveDuplicates } from './news';

const at = (iso: string) => new Date(iso);
const ev = (id: string, title: string, when: string, seen: string, externalId = Number(id.replace(/\D/g, '')) || 1) =>
  ({ id, externalId, currency: 'GBP', title, eventAt: at(when), lastSeenAt: at(seen) }) satisfies DedupeEvent;

describe('newsRange', () => {
  it('covers whole UTC days, end inclusive', () => {
    const r = newsRange({ start: '2026-10-03', end: '2026-10-24' });
    expect(r.start.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-25T00:00:00.000Z');
  });
});

describe('resolveDuplicates', () => {
  it('keeps the listing from the latest export when an event is rescheduled', () => {
    const r = resolveDuplicates([
      ev('a1', 'MPC Member Pill Speaks', '2026-10-08T10:00:00Z', '2026-10-07T21:00:00Z'),
      ev('b2', 'MPC Member Pill Speaks', '2026-10-08T11:30:00Z', '2026-10-08T21:00:00Z'),
    ]);
    expect(r.get('a1')).toBe('b2');
    expect(r.get('b2')).toBeNull();
  });

  it('picks the newer firm id when both listings are in the same export', () => {
    const r = resolveDuplicates([
      ev('x9', 'MPC Member Pill Speaks', '2026-10-08T10:00:00Z', '2026-10-08T21:00:00Z', 9),
      ev('x3', 'mpc member pill speaks ', '2026-10-08T12:00:00Z', '2026-10-08T21:00:00Z', 3),
    ]);
    expect(r.get('x3')).toBe('x9');
    expect(r.get('x9')).toBeNull();
  });

  it('keeps separate events 3 hours or more apart, other titles and other currencies', () => {
    const r = resolveDuplicates([
      ev('c1', 'Bank Holiday', '2026-10-08T00:00:00Z', '2026-10-08T21:00:00Z'),
      ev('c2', 'Bank Holiday', '2026-10-08T03:00:00Z', '2026-10-08T21:00:00Z'),
      ev('c3', 'CPI m/m', '2026-10-08T01:00:00Z', '2026-10-08T21:00:00Z'),
      { ...ev('c4', 'Bank Holiday', '2026-10-08T00:30:00Z', '2026-10-08T21:00:00Z'), currency: 'USD' },
    ]);
    expect([...r.values()]).toEqual([null, null, null, null]);
  });

  it('chains listings into one cluster', () => {
    const r = resolveDuplicates([
      ev('d1', 'Speech', '2026-10-08T08:00:00Z', '2026-10-06T21:00:00Z'),
      ev('d2', 'Speech', '2026-10-08T10:00:00Z', '2026-10-07T21:00:00Z'),
      ev('d3', 'Speech', '2026-10-08T12:00:00Z', '2026-10-08T21:00:00Z'),
    ]);
    expect(r.get('d1')).toBe('d3');
    expect(r.get('d2')).toBe('d3');
    expect(r.get('d3')).toBeNull();
  });
});
