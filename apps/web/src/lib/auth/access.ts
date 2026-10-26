/** Who is asking: the owner, an invited Backtest Lab user (`guest`), or nobody signed in. */
export type Role = 'owner' | 'guest' | null;

export type Access = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'forbidden' };

const PUBLIC_PATHS = ['/login', '/auth/callback'];
/** Everything an invited user may reach: the Backtest Lab and the market data it loads. */
const GUEST_PATHS = ['/backtest', '/api/backtest'];

const under = (pathname: string, paths: string[]) => paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Where each role lands after signing in. */
export const homeOf = (role: Exclude<Role, null>) => (role === 'owner' ? '/' : '/backtest');

/**
 * The proxy's rules. Signed out: only sign-in pages. Invited users: the Backtest Lab only (other pages send
 * them there, other APIs answer 403). The owner: everything.
 */
export function accessFor(pathname: string, role: Role): Access {
  if (role === null) {
    if (under(pathname, PUBLIC_PATHS)) return { kind: 'allow' };
    return { kind: 'redirect', to: pathname === '/' ? '/login' : `/login?next=${encodeURIComponent(pathname)}` };
  }
  if (pathname === '/login') return { kind: 'redirect', to: homeOf(role) };
  if (role === 'owner' || under(pathname, [...GUEST_PATHS, ...PUBLIC_PATHS])) return { kind: 'allow' };
  return pathname.startsWith('/api/') ? { kind: 'forbidden' } : { kind: 'redirect', to: '/backtest' };
}
