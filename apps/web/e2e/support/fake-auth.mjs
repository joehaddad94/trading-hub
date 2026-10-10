// Local-only stand-in for Supabase Auth, used when E2E_FAKE_AUTH=1 (cloud containers can't run `supabase start`).
// It answers the one call the app makes with an HS256 token, GET /auth/v1/user, and trusts the token's claims.
// Never used in CI or production: CI runs the real local Supabase.
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_AUTH_PORT ?? 54321);

function claimsOf(header) {
  const token = header?.replace(/^Bearer /, '') ?? '';
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload.exp * 1000 > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url?.startsWith('/auth/v1/user')) {
    const claims = claimsOf(req.headers.authorization);
    if (!claims) {
      res.writeHead(401).end(JSON.stringify({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }));
      return;
    }
    res.end(
      JSON.stringify({
        id: claims.sub,
        aud: 'authenticated',
        role: 'authenticated',
        email: claims.email,
        app_metadata: {},
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      }),
    );
    return;
  }
  if (req.url === '/health') {
    res.end('{}');
    return;
  }
  res.writeHead(404).end(JSON.stringify({ msg: `fake auth: ${req.method} ${req.url} not handled` }));
}).listen(port, '127.0.0.1');
