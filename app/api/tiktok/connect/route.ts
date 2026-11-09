import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildTikTokAuthorizationUrl, createPkcePair, tiktokConfigured } from '@/lib/tiktok';

export const dynamic = 'force-dynamic';

const NEXT_COOKIE = 'tt_oauth_next';

/** Only same-origin paths may be used as a post-OAuth landing spot. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!tiktokConfigured()) {
    const target = new URL(next ?? '/tiktok', request.url);
    target.searchParams.set('platform', 'unconfigured');
    return NextResponse.redirect(target);
  }

  const state = randomBytes(24).toString('base64url');
  const { verifier, challenge } = createPkcePair();
  const response = NextResponse.redirect(
    buildTikTokAuthorizationUrl({ state, codeChallenge: challenge })
  );

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  };
  response.cookies.set('tt_oauth_state', state, cookieOptions);
  response.cookies.set('tt_pkce_verifier', verifier, cookieOptions);

  if (next) {
    response.cookies.set(NEXT_COOKIE, next, cookieOptions);
  }

  return response;
}
