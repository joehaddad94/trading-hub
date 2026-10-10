import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/** Cron routes require `Authorization: Bearer ${CRON_SECRET}` (CLAUDE.md rule 12). No secret → nothing passes. */
export function isCronAuthorized(header: string | null, secret = env.CRON_SECRET): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
