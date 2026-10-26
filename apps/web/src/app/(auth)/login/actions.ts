'use server';

import { isBacktestUser, recordBacktestSignIn, recordSignInFailure, signInThrottled } from '@trading/backtest/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { homeOf } from '@/lib/auth/access';
import { isAllowedEmail } from '@/lib/auth/allowed-email';
import { env } from '@/lib/env';
import { getDb } from '@/lib/server/db';
import { signInWithoutLink } from '@/lib/server/guest-sign-in';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const input = z.object({ email: z.email('Enter a valid email.') });

const NO_ACCESS = 'This email doesn’t have access. Ask the owner to add you.';

/**
 * The owner gets a magic link by email, as before. An email on the Backtest Lab list signs straight in (no
 * link, Joe's rule) and lands in the lab; anything else is refused, with failed tries throttled per IP.
 */
export async function signInAction(_prev: ActionResult<null> | null, form: FormData): Promise<ActionResult<null>> {
  const parsed = input.safeParse({ email: form.get('email') });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' };
  const email = parsed.data.email.trim().toLowerCase();
  const h = await headers();

  if (isAllowedEmail(email, env.ALLOWED_EMAIL)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${h.get('origin') ?? ''}/auth/callback` },
    });
    if (error) return { ok: false, error: 'Could not send the sign-in link. Try again.' };
    return { ok: true, data: null };
  }

  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  if (await signInThrottled(db, ip)) return { ok: false, error: 'Too many tries. Wait 15 minutes and try again.' };
  if (!(await isBacktestUser(db, email))) {
    await recordSignInFailure(db, ip);
    return { ok: false, error: NO_ACCESS };
  }
  const signedIn = await signInWithoutLink(email);
  if (!signedIn.ok) return signedIn;
  await recordBacktestSignIn(db, email, signedIn.data.userId);
  redirect(homeOf('guest'));
}
