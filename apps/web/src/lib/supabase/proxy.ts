import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowed-email';
import { env } from '@/lib/env';

const PUBLIC_PATHS = ['/login', '/auth/callback'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Refreshes the Supabase session cookie and keeps everyone but ALLOWED_EMAIL out. */
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

  const signedIn = isAllowedEmail(email, env.ALLOWED_EMAIL);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}
