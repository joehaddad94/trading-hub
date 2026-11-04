import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  type CompareSide,
  type CompareTrade,
  gapR,
  isPeriodKey,
  killZonesInSpan,
  liveVsBacktestPeriod,
  onePickPerSession,
  periodKeyOf,
  periodLabel,
  pickMatch,
  rangePosition,
  sessionKeyOf,
  sessionStartOf,
  shiftPeriod,
} from './live-vs-backtest';

const t = (net: string, symbol: string, openedAt: string, opts: Partial<CompareTrade> = {}): CompareTrade => ({
  netProfit: net,
  riskUsd: '100',
  riskSource: 'journal_sl',
  symbol,
  openedAt: new Date(openedAt),
  closedAt: new Date(new Date(openedAt).getTime() + 600_000),
  ...opts,
});

// Tue 6 Oct 2026: 13:40Z = 09:40 New York (NY AM); 17:40Z = 13:40 New York (NY PM).
const AM = '2026-10-06T13:40:00Z';
const AM_LATER = '2026-10-06T14:10:00Z';
const PM = '2026-10-06T17:40:00Z';

describe('sessions and periods', () => {
  it('keys a session by New York day and kill zone', () => {
    expect(sessionKeyOf(new Date(AM))).toBe('2026-10-06|ny_am');
    // 21:00 ET Sunday 1 Nov (after the DST switch, 02:00Z Mon) is Sunday's Asia session.
    expect(sessionKeyOf(new Date('2026-11-02T02:00:00Z'))).toBe('2026-11-01|asia');
  });

  it('puts Sunday in the following ET week and names weeks by Monday', () => {
    expect(periodKeyOf('week', new Date(AM))).toBe('2026-10-05');
    expect(periodKeyOf('week', new Date('2026-11-02T02:00:00Z'))).toBe('2026-11-02');
    expect(periodKeyOf('week', new Date('2026-11-07T03:00:00Z'))).toBe('2026-11-02'); // Fri 23:00 ET
    expect(periodKeyOf('month', new Date('2026-11-01T02:00:00Z'))).toBe('2026-10'); // 31 Oct 22:00 ET
    expect(periodKeyOf('all', new Date(AM))).toBe('all');
  });

  it('steps, validates and labels periods', () => {
    expect(shiftPeriod('week', '2026-11-02', -1)).toBe('2026-10-26');
    expect(shiftPeriod('week', '2026-12-28', 1)).toBe('2027-01-04');
    expect(shiftPeriod('month', '2026-01', -1)).toBe('2025-12');
    expect(isPeriodKey('week', '2026-11-02')).toBe(true);
    expect(isPeriodKey('week', '2026-11-03')).toBe(false);
    expect(isPeriodKey('month', '2026-13')).toBe(false);
    expect(isPeriodKey('month', '2026-11')).toBe(true);
    expect(periodLabel('week', '2026-11-02')).toBe('2–6 Nov 2026');
    expect(periodLabel('week', '2026-09-28')).toBe('28 Sep – 2 Oct 2026');
    expect(periodLabel('week', '2026-12-28')).toBe('28 Dec 2026 – 1 Jan 2027');
    expect(periodLabel('month', '2026-11')).toBe('November 2026');
  });
});

describe('one pick and pick match', () => {
  it('keeps only the first backtest trade to open in each session, on either index', () => {
    const picks = onePickPerSession([t('100', 'US30', AM_LATER), t('-100', 'NDX100', AM), t('200', 'US30', PM)]);
    expect(picks.map((p) => p.symbol)).toEqual(['NDX100', 'US30']);
  });

  it('counts sessions where live opened first on the index the backtest triggered first', () => {
    const live = [t('1', 'US30', AM), t('1', 'NDX100', AM_LATER), t('1', 'US30', PM)];
    const bt = [t('1', 'US30', AM_LATER), t('1', 'NDX100', '2026-10-06T13:35:00Z'), t('1', 'US30', PM)];
    const m = pickMatch(live, bt);
    expect(m.sessions).toBe(2);
    expect(m.matched).toBe(1);
    expect(m.rate?.toNumber()).toBe(0.5);
    expect(pickMatch(live, []).rate).toBeNull();
  });
});

describe('liveVsBacktestPeriod', () => {
  it('compares a period: portfolio counts both indices, one pick counts the first', () => {
    const live = [t('100', 'US30', AM, { followedPlan: true }), t('-100', 'US30', PM, { followedPlan: false })];
    const bt = [
      t('200', 'NDX100', AM),
      t('-100', 'US30', AM_LATER),
      t('100', 'US30', PM),
      t('300', 'US30', '2026-10-13T13:40:00Z'), // next week
    ];
    const r = liveVsBacktestPeriod(live, bt, 'week', '2026-10-05');
    const all = r.rows[0];
    expect(all?.symbol).toBe('all');
    expect(all?.live?.trades).toBe(2);
    expect(all?.live?.netR?.toNumber()).toBe(0);
    expect(all?.portfolio?.trades).toBe(3);
    expect(all?.portfolio?.netR?.toNumber()).toBe(2);
    expect(all?.portfolio?.rPerSession?.toNumber()).toBe(1);
    expect(all?.onePick?.trades).toBe(2);
    expect(all?.onePick?.netR?.toNumber()).toBe(3);
    expect(gapR(all?.live ?? null, all?.onePick ?? null)?.toNumber()).toBe(1.5);
    expect(r.rows.map((x) => x.symbol)).toEqual(['all', 'NDX100', 'US30']);
    expect(r.rows[1]?.live?.trades).toBe(0);
    expect(r.pickMatch).toMatchObject({ sessions: 2, matched: 1 });
    expect(r.coverage).toMatchObject({ liveSessions: 2, coveredLiveSessions: 2, backtestedSessions: 2 });
    expect(r.adherence.answered).toBe(2);
    expect(r.adherence.rate?.toNumber()).toBe(0.5);
    expect(r.adherence.followedSide?.netR?.toNumber()).toBe(1);
    expect(r.adherence.brokeSide?.netR?.toNumber()).toBe(-1);
  });

  it('compares only backtested sessions and shows what is left to backtest', () => {
    // Live traded NY AM and NY PM on 6 Oct and NY AM on 7 Oct; only 6 Oct NY AM has a backtest trade.
    const live = [t('100', 'US30', AM), t('-100', 'US30', PM), t('50', 'US30', '2026-10-07T13:40:00Z')];
    const bt = [t('200', 'US30', AM)];
    const r = liveVsBacktestPeriod(live, bt, 'week', '2026-10-05');
    expect(r.rows[0]?.live?.trades).toBe(1);
    expect(r.rows[0]?.live?.netR?.toNumber()).toBe(1);
    expect(r.coverage).toMatchObject({
      liveSessions: 3,
      coveredLiveSessions: 1,
      backtestedSessions: 1,
      uncoveredLiveTrades: 2,
      missedByLive: 0,
    });
    // First uncovered: 6 Oct NY PM, which opens 13:30 New York = 17:30Z.
    expect(r.coverage.firstUncoveredAt?.toISOString()).toBe('2026-10-06T17:30:00.000Z');
  });

  it('counts a replayed session without a backtest trade as 0R for the backtest', () => {
    const live = [t('-100', 'US30', PM), t('100', 'US30', '2026-10-13T13:40:00Z')];
    const r = liveVsBacktestPeriod(live, [], 'week', '2026-10-05', 0.1, [
      '2026-10-06|ny_pm',
      '2026-10-06|ny_am',
      '2026-10-13|ny_am', // other week: ignored
    ]);
    expect(r.coverage).toMatchObject({ liveSessions: 1, coveredLiveSessions: 1, backtestedSessions: 2 });
    expect(r.rows[0]?.live?.netR?.toNumber()).toBe(-1);
    expect(r.rows[0]?.onePick).toMatchObject({ trades: 0 });
    expect(r.rows[0]?.onePick?.netR?.toNumber()).toBe(0);
  });

  it('shows no comparison when nothing in the period was backtested', () => {
    const r = liveVsBacktestPeriod(
      [t('100', 'US30', AM)],
      [t('1', 'US30', '2026-10-13T13:40:00Z')],
      'week',
      '2026-10-05',
    );
    expect(r.coverage).toMatchObject({ liveSessions: 1, coveredLiveSessions: 0, backtestedSessions: 0 });
    expect(r.rows[0]?.live).toBeNull();
    expect(r.rows[0]?.portfolio).toBeNull();
    expect(r.coverage.firstUncoveredAt?.toISOString()).toBe('2026-10-06T13:30:00.000Z');
    expect(sessionStartOf(new Date('2026-10-07T01:00:00Z')).toISOString()).toBe('2026-10-07T00:00:00.000Z'); // Asia 20:00 ET
  });
});

describe('rangePosition', () => {
  it('places live R below, inside or above the one pick … portfolio range', () => {
    const side = (r: number) => ({ netR: new Decimal(r) }) as CompareSide;
    const row = (l: number) => ({ symbol: 'all', live: side(l), onePick: side(1), portfolio: side(3) });
    expect(rangePosition(row(-1))).toMatchObject({ position: 'below' });
    expect(rangePosition(row(-1))?.by.toNumber()).toBe(2);
    expect(rangePosition(row(2))?.position).toBe('inside');
    expect(rangePosition(row(5))?.by.toNumber()).toBe(2);
    expect(rangePosition({ symbol: 'all', live: null, onePick: null, portfolio: null })).toBeNull();
  });
});

describe('killZonesInSpan', () => {
  it('lists the kill zones a replay span entered', () => {
    // 6 Oct 2026 09:00–14:00 New York: NY AM fully, NY PM from 13:30.
    expect(killZonesInSpan(new Date('2026-10-06T13:00:00Z'), new Date('2026-10-06T18:00:00Z'))).toEqual([
      '2026-10-06|ny_am',
      '2026-10-06|ny_pm',
    ]);
    // A single point inside Asia (21:00 New York) and one outside every zone.
    const asia = new Date('2026-10-07T01:00:00Z');
    expect(killZonesInSpan(asia, asia)).toEqual(['2026-10-06|asia']);
    const outside = new Date('2026-10-06T17:00:00Z');
    expect(killZonesInSpan(outside, outside)).toEqual([]);
    // Ending exactly at a zone's end does not reach the next zone.
    expect(killZonesInSpan(new Date('2026-10-06T16:00:00Z'), new Date('2026-10-06T16:00:00Z'))).toEqual([]);
  });
});
