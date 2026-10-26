import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { ActionResult } from '@/lib/action-result';
import { env } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Joe's rule (26 Oct 2026, temporary): an invited Backtest Lab user signs in with their email alone. The server
 * makes a one-time magic-link token with the service role and redeems it at once, so no email is sent and the
 * session cookie is set on this response. Only for emails already checked against the list; never the owner.
 */
export async function signInWithoutLink(email: string): Promise<ActionResult<{ userId: string }>> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'Sign-in for invited users is not set up yet (SUPABASE_SERVICE_ROLE_KEY).' };
  }
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // First visit: make the auth user. Later visits: it exists already, which is fine.
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already/i.test(created.error.message)) return { ok: false, error: 'Could not sign you in.' };

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) return { ok: false, error: 'Could not sign you in.' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: link.data.properties.hashed_token,
  });
  if (error || !data.user) return { ok: false, error: 'Could not sign you in.' };
  return { ok: true, data: { userId: data.user.id } };
}
