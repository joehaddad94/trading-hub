'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { isAllowedEmail } from '@/lib/auth/allowed-email';
import { env } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const input = z.object({ email: z.email('Enter a valid email.') });

export async function sendMagicLink(_prev: ActionResult<null> | null, form: FormData): Promise<ActionResult<null>> {
  const parsed = input.safeParse({ email: form.get('email') });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' };

  // Same response for any non-allowed email, so the form doesn't reveal who can sign in.
  if (!isAllowedEmail(parsed.data.email, env.ALLOWED_EMAIL)) return { ok: true, data: null };

  const origin = (await headers()).get('origin') ?? '';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { ok: false, error: 'Could not send the sign-in link. Try again.' };
  return { ok: true, data: null };
}
