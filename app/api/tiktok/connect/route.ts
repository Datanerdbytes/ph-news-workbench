import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildTikTokAuthorizationUrl, createPkcePair, tiktokConfigured } from '@/lib/tiktok';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!tiktokConfigured()) {
    return NextResponse.redirect(new URL('/tiktok?platform=unconfigured', request.url));
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

  return response;
}
