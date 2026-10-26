// Local-only stand-in for Supabase Auth, used when E2E_FAKE_AUTH=1 (cloud containers can't run `supabase start`).
// It answers GET /auth/v1/user for an HS256 token (trusting its claims), plus the admin calls behind the
// Backtest Lab's email-only sign-in: create user, generate a magic-link token, verify it into a session.
// Never used in CI or production: CI runs the real local Supabase.
import { createHash } from 'node:crypto';
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

/** A stable fake user id per email. */
function userIdOf(email) {
  const h = createHash('sha256').update(email).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function userOf(email) {
  return {
    id: userIdOf(email),
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
}

function tokenFor(email) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const claims = { sub: userIdOf(email), email, role: 'authenticated', aud: 'authenticated', exp };
  return { token: `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.fake-signature`, exp };
}

async function bodyOf(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method === 'POST' && req.url?.startsWith('/auth/v1/admin/users')) {
    const { email } = await bodyOf(req);
    res.end(JSON.stringify(userOf(email)));
    return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/auth/v1/admin/generate_link')) {
    const { email } = await bodyOf(req);
    const hashed = Buffer.from(email).toString('base64url');
    res.end(
      JSON.stringify({
        ...userOf(email),
        action_link: `http://127.0.0.1:${port}/auth/v1/verify?token=${hashed}&type=magiclink`,
        email_otp: '000000',
        hashed_token: hashed,
        redirect_to: '',
        verification_type: 'magiclink',
      }),
    );
    return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/auth/v1/verify')) {
    const { token_hash: hash } = await bodyOf(req);
    const email = Buffer.from(hash ?? '', 'base64url').toString('utf8');
    if (!email.includes('@')) {
      res.writeHead(403).end(JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'invalid token' }));
      return;
    }
    const { token, exp } = tokenFor(email);
    res.end(
      JSON.stringify({
        access_token: token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        refresh_token: 'fake',
        user: userOf(email),
      }),
    );
    return;
  }
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
