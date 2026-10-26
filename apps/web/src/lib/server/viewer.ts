import 'server-only';
import { isBacktestUser, type Owner } from '@trading/backtest/server';
import { cache } from 'react';
import { isAllowedEmail } from '@/lib/auth/allowed-email';
import { env } from '@/lib/env';
import { getDb } from '@/lib/server/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Who is signed in: the owner (ALLOWED_EMAIL, everything) or an invited user (Backtest Lab only). */
export type Viewer = { userId: string; email: string; isOwner: boolean };

/** The verified viewer for this request, or null (signed out, or no longer on the Backtest Lab list). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  let claims: { sub?: unknown; email?: unknown } | undefined;
  try {
    claims = (await supabase.auth.getClaims()).data?.claims;
  } catch {
    return null;
  }
  const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : undefined;
  const userId = typeof claims?.sub === 'string' ? claims.sub : undefined;
  if (!email || !userId) return null;
  if (isAllowedEmail(email, env.ALLOWED_EMAIL)) return { userId, email, isOwner: true };
  const db = getDb();
  if (db && (await isBacktestUser(db, email))) return { userId, email, isOwner: false };
  return null;
});

/** Whose Backtest Lab rows the viewer works on (null = the owner's), or undefined when nobody may. */
export async function backtestOwner(): Promise<Owner | undefined> {
  const viewer = await getViewer();
  if (!viewer) return undefined;
  return viewer.isOwner ? null : viewer.userId;
}

export const NOT_ALLOWED = 'You don’t have access to this.';

/**
 * Tracker, Journal, News and Settings actions start with this: a Server Action can be posted from any page,
 * so the proxy's page rules alone don't keep invited users out of them.
 */
export async function ownerOnly(): Promise<{ ok: false; error: string } | null> {
  const viewer = await getViewer();
  return viewer?.isOwner ? null : { ok: false, error: NOT_ALLOWED };
}
