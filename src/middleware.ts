import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { readStamp, signStamp } from '@/lib/signed';
import { COOKIE, cookieOpts, sessionState } from '@/lib/session-policy';

// Anything not listed here requires a signed-in admin at aal2. Deny by default.
const PUBLIC = ['/login'];
const isStatic = (p: string) => p.startsWith('/_next/') || p.startsWith('/products/') || p.startsWith('/api/brand/') || p === '/favicon.ico' || p === '/icon.svg' || p === '/icon.png' || p === '/apple-icon.png' || p === '/logo.svg';

/** Storage host for the email logo (and EMAIL_LOGO_URL's host), so the email preview can show it. */
function imageHosts(): string {
  const out: string[] = [];
  for (const u of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.EMAIL_LOGO_URL]) {
    try { if (u) out.push(new URL(u).origin); } catch { /* not a URL */ }
  }
  return [...new Set(out)].join(' ');
}

function csp(nonce: string) {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", // inline style attributes only (no inline scripts)
    `img-src 'self' data: blob: https://cdn.discordapp.com ${imageHosts()}`.trim(),
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isStatic(pathname)) return NextResponse.next();

  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const secret = process.env.SESSION_SECRET ?? '';

  // CSRF: every mutating request must come from our own origin (Server Actions also enforce this).
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const allowed = new Set([req.nextUrl.host, process.env.HUB_URL ? new URL(process.env.HUB_URL).host : '']);
    let originHost = '';
    try { originHost = origin ? new URL(origin).host : ''; } catch { /* invalid */ }
    if (!originHost || !allowed.has(originHost)) return new NextResponse('Forbidden', { status: 403 });
  }

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('content-security-policy', policy);

  let res = NextResponse.next({ request: { headers: reqHeaders } });
  const finish = (r: NextResponse) => {
    r.headers.set('Content-Security-Policy', policy);
    return r;
  };
  const redirect = (to: string, clear = false) => {
    const url = req.nextUrl.clone();
    const [path, qs] = to.split('?');
    url.pathname = path!;
    url.search = qs ? `?${qs}` : '';
    const r = NextResponse.redirect(url);
    // keep refreshed Supabase cookies
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    if (clear) for (const n of [COOKIE.started, COOKIE.active, COOKIE.stepup]) r.cookies.delete(n);
    return finish(r);
  };

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: { headers: reqHeaders } });
        list.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!user) {
    return isPublic ? finish(res) : redirect('/login', true);
  }

  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const level = aal.data?.currentLevel;

  if (pathname === '/mfa') return level === 'aal2' ? redirect('/') : finish(res);

  if (level !== 'aal2') {
    // Signed in by email only: second factor still required for everything except the login screens.
    return pathname === '/login' ? finish(res) : redirect('/mfa');
  }

  // aal2 from here: enforce absolute (8h) and idle (30 min) lifetimes with signed cookies.
  const startedAt = await readStamp(secret, 'started', user.id, req.cookies.get(COOKIE.started)?.value);
  const activeAt = await readStamp(secret, 'active', user.id, req.cookies.get(COOKIE.active)?.value);
  const state = sessionState(Date.now(), startedAt, activeAt);
  if (state !== 'ok') {
    await supabase.auth.signOut();
    return redirect(`/login?reason=${state === 'idle' ? 'idle' : 'expired'}`, true);
  }
  if (pathname === '/login') return redirect('/');

  res.cookies.set(COOKIE.active, await signStamp(secret, 'active', user.id), { ...cookieOpts, maxAge: 60 * 60 * 9 });
  return finish(res);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
