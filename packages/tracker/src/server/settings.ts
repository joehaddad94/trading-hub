import { type DayBoundary, DEFAULT_DAY_BOUNDARY, DEFAULT_SCRATCH_THRESHOLD_R } from '@trading/core';
import type { Executor } from '@trading/db';
import { eq } from '@trading/db/orm';
import { appSettings } from '@trading/db/schema';

/** The two day boundaries Joe can pick (tracker §8.2). */
export const DAY_PRESETS = {
  beirut: { timeZone: 'Asia/Beirut', rolloverHour: 0, label: 'Asia/Beirut, midnight' },
  ny17: { timeZone: 'America/New_York', rolloverHour: 17, label: 'New York, 17:00 rollover' },
} as const;
export type DayPreset = keyof typeof DAY_PRESETS;

export type TrackerSettings = { boundary: DayBoundary; dayPreset: DayPreset; scratchThresholdR: number };

export const DEFAULT_SETTINGS: TrackerSettings = {
  boundary: DEFAULT_DAY_BOUNDARY,
  dayPreset: 'beirut',
  scratchThresholdR: DEFAULT_SCRATCH_THRESHOLD_R,
};

function presetOf(b: DayBoundary): DayPreset {
  return b.timeZone === DAY_PRESETS.ny17.timeZone && b.rolloverHour === DAY_PRESETS.ny17.rolloverHour
    ? 'ny17'
    : 'beirut';
}

export async function getTrackerSettings(db: Executor): Promise<TrackerSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, true));
  if (!row) return DEFAULT_SETTINGS;
  const boundary = { timeZone: row.dayTimeZone, rolloverHour: row.dayRolloverHour };
  // The threshold is a small ratio (0–1), not money: a float is fine here.
  return { boundary, dayPreset: presetOf(boundary), scratchThresholdR: Number(row.scratchThresholdR) };
}

export async function saveTrackerSettings(db: Executor, input: { dayPreset: DayPreset; scratchThresholdR: string }) {
  const preset = DAY_PRESETS[input.dayPreset];
  const values = {
    dayTimeZone: preset.timeZone,
    dayRolloverHour: preset.rolloverHour,
    scratchThresholdR: input.scratchThresholdR,
  };
  await db
    .insert(appSettings)
    .values({ id: true, ...values })
    .onConflictDoUpdate({ target: appSettings.id, set: values });
}
