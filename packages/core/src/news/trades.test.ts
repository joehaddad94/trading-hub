import { describe, expect, it } from 'vitest';
import { eventsAroundTrade, hasNewsAddon, newsAnalytics, restrictionApplies } from './trades';
import type { CalendarEvent } from './week';

const ev = (id: string, iso: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  currency: 'USD',
  impact: 'high',
  eventAt: new Date(iso),
  forecast: null,
  previous: null,
  isRestricted: true,
  ...extra,
});

describe('restriction applicability', () => {
  it('reads the ANT add-on from the applicable rules', () => {
    expect(hasNewsAddon({ applicable_rules: [{ condition: 'ANT', value: '1' }] })).toBe(true);
    expect(hasNewsAddon({ applicable_rules: [{ condition: 'ANT', value: '0' }] })).toBe(false);
    expect(hasNewsAddon(null)).toBe(false);
  });

  it('defaults on only for funded accounts without the add-on; an override wins', () => {
    expect(restrictionApplies({ phase: 'funded', newsAddon: false, override: null })).toBe(true);
    expect(restrictionApplies({ phase: 'funded', newsAddon: true, override: null })).toBe(false);
    expect(restrictionApplies({ phase: 'p1', newsAddon: false, override: null })).toBe(false);
    expect(restrictionApplies({ phase: 'p2', newsAddon: false, override: true })).toBe(true);
    expect(restrictionApplies({ phase: 'funded', newsAddon: false, override: false })).toBe(false);
  });
});

describe('eventsAroundTrade', () => {
  const trade = { openedAt: new Date('2026-10-07T17:57:00Z'), closedAt: new Date('2026-10-07T18:30:00Z') };
  const w = { minutesBefore: 5, minutesAfter: 5 };

  it('lists events within an hour with minutes before/after and the window flag', () => {
    const near = eventsAroundTrade(
      trade,
      [
        ev('fomc', '2026-10-07T18:00:00Z'),
        ev('speech', '2026-10-07T19:20:00Z', { isRestricted: false, impact: 'medium' }),
        ev('far', '2026-10-07T20:00:00Z'),
      ],
      w,
    );
    expect(near.map((e) => [e.id, e.minutesFromOpen, e.minutesFromClose, e.inWindow])).toEqual([
      ['fomc', -3, 30, true],
      ['speech', -83, -50, false],
    ]);
  });

  it('is outside the window just past it', () => {
    const t = { openedAt: new Date('2026-10-07T17:54:59Z'), closedAt: new Date('2026-10-07T17:54:59Z') };
    expect(eventsAroundTrade(t, [ev('fomc', '2026-10-07T18:00:00Z')], w)[0]?.inWindow).toBe(false);
  });
});

describe('newsAnalytics', () => {
  const t = (open: string, net: string) => ({
    openedAt: new Date(open),
    closedAt: new Date(new Date(open).getTime() + 10 * 60_000),
    netProfit: net,
    riskUsd: '100',
  });

  it('splits by red-folder day, by ±30 min and per event type', () => {
    const trades = [
      t('2026-10-07T17:45:00Z', '200'),
      t('2026-10-07T09:00:00Z', '-100'),
      t('2026-10-08T12:00:00Z', '50'),
    ];
    const a = newsAnalytics(trades, [
      ev('FOMC Meeting Minutes', '2026-10-07T18:00:00Z'),
      ev('ISM', '2026-10-08T14:00:00Z', { impact: 'medium' }),
    ]);
    expect([a.byDay.newsTrades, a.byDay.otherTrades]).toEqual([2, 1]);
    expect(a.byDay.news.net.toFixed(2)).toBe('100.00');
    expect([a.near.newsTrades, a.near.otherTrades]).toEqual([1, 2]);
    expect(a.byEvent).toEqual([expect.objectContaining({ title: 'FOMC Meeting Minutes', days: 1 })]);
    expect(a.byEvent[0]?.stats.trades).toBe(2);
  });
});
