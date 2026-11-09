import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildGoogleAuthorizationUrl, googleConfigured } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

const NEXT_COOKIE = 'yt_oauth_next';

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

  if (!googleConfigured()) {
    const target = new URL(next ?? '/youtube', request.url);
    target.searchParams.set('google', 'unconfigured');
    return NextResponse.redirect(target);
  }

  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(buildGoogleAuthorizationUrl(state));

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  };
  response.cookies.set('yt_oauth_state', state, cookieOptions);

  if (next) {
    response.cookies.set(NEXT_COOKIE, next, cookieOptions);
  }

  return response;
}
