import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildAuthorizationUrl, facebookConfigured } from '@/lib/facebook';
import { INSTAGRAM_SCOPES } from '@/lib/instagram';
import { safeNext } from '@/lib/oauth-return';

export const dynamic = 'force-dynamic';

const NEXT_COOKIE = 'fb_oauth_next';
const CHANNEL_COOKIE = 'fb_oauth_channel';

/** Same Meta app + same callback as Facebook; scopes stack IG publishing on. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!facebookConfigured()) {
    return NextResponse.redirect(new URL('/instagram', request.url));
  }

  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(
    buildAuthorizationUrl(state, INSTAGRAM_SCOPES)
  );

  // Reuses the fb_oauth_state cookie on purpose: the callback that consumes
  // it is the shared Facebook flow, which already persists Page rows,
  // decrypted long-lived tokens, and the granted scope set this gate reads.
  response.cookies.set('fb_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });

  // The callback reads this to send the actor back where they clicked Connect.
  if (next) {
    response.cookies.set(NEXT_COOKIE, next, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    });
  }

  // Lets the shared callback report this run as an Instagram outcome instead
  // of a Facebook one, so the two toasts never fire for the same redirect.
  response.cookies.set(CHANNEL_COOKIE, 'instagram', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });

  return response;
}
