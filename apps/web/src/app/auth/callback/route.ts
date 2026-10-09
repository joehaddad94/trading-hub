import { type NextRequest, NextResponse } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowed-email';
import { env } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && isAllowedEmail(data.user?.email, env.ALLOWED_EMAIL)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL('/login?error=not-allowed', request.url));
}
