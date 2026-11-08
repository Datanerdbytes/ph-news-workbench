import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildGoogleAuthorizationUrl, googleConfigured } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/youtube?google=unconfigured', request.url));
  }

  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(buildGoogleAuthorizationUrl(state));

  response.cookies.set('yt_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });

  return response;
}
