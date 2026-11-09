import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildAuthorizationUrl, facebookConfigured } from '@/lib/facebook';
import { returnUrl, safeNext } from '@/lib/oauth-return';

export const dynamic = 'force-dynamic';

const NEXT_COOKIE = 'fb_oauth_next';

export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!facebookConfigured()) {
    return NextResponse.redirect(
      returnUrl(request, next ?? '/', 'facebook', 'unconfigured')
    );
  }

  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(buildAuthorizationUrl(state));

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  };
  response.cookies.set('fb_oauth_state', state, cookieOptions);

  if (next) {
    response.cookies.set(NEXT_COOKIE, next, cookieOptions);
  }

  return response;
}
