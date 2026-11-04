import { describe, expect, it } from 'vitest';
import { pickStep, timeAxisTicks } from './time-axis';

const MIN = 60_000;
/** 1m bars from `start` (UTC ms), `n` of them. */
const bars = (start: number, n: number, every = 1) => Array.from({ length: n }, (_, i) => start + i * every * MIN);

describe('pickStep', () => {
  it('picks the smallest round step that keeps labels apart', () => {
    // 10px bars on 1m: 10 bars (100px) is the first that clears 80px.
    expect(pickStep(1, 10)).toMatchObject({ unit: 'minute', size: 10 });
    // 3px bars on 1m: 30 bars = 90px.
    expect(pickStep(1, 3)).toMatchObject({ unit: 'minute', size: 30 });
    // 15m chart never uses steps finer than a bar.
    expect(pickStep(15, 100)).toMatchObject({ unit: 'minute', size: 15 });
    expect(pickStep(15, 2)).toMatchObject({ unit: 'minute', size: 12 * 60 });
  });
});

describe('timeAxisTicks', () => {
  it('lands ticks on round times in the chart time zone, not every N bars', () => {
    // 13:43 Beirut (UTC+2 on 4 Nov 2026) = 11:43Z.
    const start = Date.UTC(2026, 10, 4, 11, 43);
    const ts = bars(start, 300);
    const ticks = timeAxisTicks({
      timestamps: ts,
      first: 0,
      visibleFrom: 0,
      barPx: 3,
      intervalMin: 1,
      timeZone: 'Asia/Beirut',
    });
    expect(ticks.map((t) => t.text)).toEqual([
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
      '17:30',
      '18:00',
      '18:30',
    ]);
    expect(ticks[0]?.index).toBe(17);
  });

  it('follows New York time and labels the day boundary with the day number', () => {
    // 22:00 ET on 3 Nov (EST, UTC-5) = 03:00Z on 4 Nov.
    const ts = bars(Date.UTC(2026, 10, 4, 3, 0), 300);
    const ticks = timeAxisTicks({
      timestamps: ts,
      first: 0,
      visibleFrom: 0,
      barPx: 2,
      intervalMin: 1,
      timeZone: 'America/New_York',
    });
    expect(ticks.map((t) => t.text)).toEqual(['23:00', '4', '01:00', '02:00']);
  });

  it('labels month and year boundaries', () => {
    const day = 86_400_000;
    const ts = Array.from({ length: 90 }, (_, i) => Date.UTC(2026, 10, 1) + i * day);
    const ticks = timeAxisTicks({
      timestamps: ts,
      first: 0,
      visibleFrom: 0,
      barPx: 5,
      intervalMin: 1440,
      timeZone: 'UTC',
    });
    expect(ticks.map((t) => t.text)).toEqual(['Dec', '2027']);
  });

  it('uses the bar before the screen to find a boundary on the first visible bar', () => {
    const ts = bars(Date.UTC(2026, 10, 4, 11, 59), 40);
    const ticks = timeAxisTicks({
      timestamps: ts,
      first: 99,
      visibleFrom: 100,
      barPx: 3,
      intervalMin: 1,
      timeZone: 'UTC',
    });
    expect(ticks[0]).toEqual({ index: 100, text: '12:00' });
  });

  it('drops a time label crowded by a day label after a session gap', () => {
    // 16:58, 16:59 ET then the 18:00 reopen; 10px bars pick a 10 minute step.
    const close = Date.UTC(2026, 10, 4, 21, 50);
    const ts = [...bars(close, 10), ...bars(Date.UTC(2026, 10, 4, 23, 0), 5)];
    const ticks = timeAxisTicks({
      timestamps: ts,
      first: 0,
      visibleFrom: 0,
      barPx: 10,
      intervalMin: 1,
      timeZone: 'America/New_York',
    });
    expect(ticks.map((t) => t.text)).toEqual(['18:00']);
  });
});
