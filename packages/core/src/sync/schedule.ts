import { TZDate } from '@date-fns/tz';

/** Producer schedule (docs/ops/sync.md): 00:20 Asia/Beirut, Tuesday–Saturday. */
export const PRODUCER_TZ = 'Asia/Beirut';
const RUN_DAYS = new Set([2, 3, 4, 5, 6]); // Tue..Sat (0 = Sunday)
const RUN_HOUR = 0;
const RUN_MINUTE = 20;

/** The most recent scheduled producer run at or before `at` (DST-safe, computed in Beirut time). */
export function lastExpectedRun(at: Date): Date {
  const local = new TZDate(at.getTime(), PRODUCER_TZ);
  for (let back = 0; back < 8; back++) {
    const day = new TZDate(
      local.getFullYear(),
      local.getMonth(),
      local.getDate() - back,
      RUN_HOUR,
      RUN_MINUTE,
      0,
      PRODUCER_TZ,
    );
    if (RUN_DAYS.has(day.getDay()) && day.getTime() <= at.getTime()) return new Date(day.getTime());
  }
  throw new Error('unreachable: a run happens every week');
}
