import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildAuthorizationUrl, facebookConfigured } from '@/lib/facebook';

export const dynamic = 'force-dynamic';

function outcome(request: Request, code: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('facebook', code);
  return url;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!facebookConfigured()) {
    return NextResponse.redirect(outcome(request, 'unconfigured'));
  }

  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(buildAuthorizationUrl(state));

  response.cookies.set('fb_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });

  return response;
}
