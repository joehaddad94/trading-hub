import { createServerClient } from '@supabase/ssr';
import { isBacktestUser } from '@trading/backtest/server';
import { type NextRequest, NextResponse } from 'next/server';
import { accessFor, type Role } from '@/lib/auth/access';
import { isAllowedEmail } from '@/lib/auth/allowed-email';
import { env } from '@/lib/env';
import { getDb } from '@/lib/server/db';

/**
 * Refreshes the Supabase session cookie and applies the access rules: the owner (ALLOWED_EMAIL) everywhere,
 * emails on the Backtest Lab list there only (checked on every request, so removal works at once).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() verifies the JWT; never trust getSession() on the server.
  let email: string | undefined;
  try {
    const { data } = await supabase.auth.getClaims();
    email = typeof data?.claims.email === 'string' ? data.claims.email : undefined;
  } catch {
    email = undefined;
  }

  const role = await roleOf(email);
  const access = accessFor(request.nextUrl.pathname, role);
  if (access.kind === 'forbidden') return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  if (access.kind === 'redirect') return NextResponse.redirect(new URL(access.to, request.url));
  return response;
}

async function roleOf(email: string | undefined): Promise<Role> {
  if (!email) return null;
  if (isAllowedEmail(email, env.ALLOWED_EMAIL)) return 'owner';
  const db = getDb();
  if (!db) return null;
  try {
    return (await isBacktestUser(db, email)) ? 'guest' : null;
  } catch {
    return null;
  }
}
