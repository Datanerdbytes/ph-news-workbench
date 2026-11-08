import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getWorkspaceForUser } from '@/lib/workspaces';
import {
  exchangeGoogleCode,
  fetchYouTubeChannel,
  googleConfigured,
} from '@/lib/youtube';
import {
  encryptYouTubeSecret,
} from '@/lib/facebook-token';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'yt_oauth_state';

function matchesState(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function finish(request: NextRequest, outcome: string) {
  const url = new URL('/youtube', request.url);
  url.searchParams.set('google', outcome);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const denied = params.get('error');

  if (denied) {
    const outcome = denied === 'access_denied' ? 'denied' : 'error';
    return finish(request, outcome);
  }

  if (!googleConfigured()) {
    return finish(request, 'unconfigured');
  }

  const state = params.get('state') ?? '';
  const expectedState = request.cookies.get(STATE_COOKIE)?.value ?? '';
  if (!state || !expectedState || !matchesState(state, expectedState)) {
    return finish(request, 'state');
  }

  const code = params.get('code');
  if (!code) {
    return finish(request, 'error');
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return finish(request, 'error');
  }
  const workspace = await getWorkspaceForUser(session.user);
  if (!workspace) {
    return finish(request, 'error');
  }

  try {
    const token = await exchangeGoogleCode(code);
    let channelId = 'unknown';
    let username = 'YouTube';
    try {
      const channel = await fetchYouTubeChannel(token.accessToken);
      if (channel) {
        channelId = channel.id;
        username = channel.title;
      }
    } catch {
      // Channel probe is cosmetic; the grant itself is valid and stored.
    }

    await sql`
      INSERT INTO youtube_connections (
        workspace_id, user_id, youtube_user_id, username,
        access_token, refresh_token, scopes, expires_at
      )
      VALUES (
        ${workspace.id}, ${session.user.id}, ${channelId}, ${username},
        ${encryptYouTubeSecret(token.accessToken)},
        ${token.refreshToken ? encryptYouTubeSecret(token.refreshToken) : null},
        ${token.scope.join(',')},
        ${token.expiresAt}
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        youtube_user_id = EXCLUDED.youtube_user_id,
        username = EXCLUDED.username,
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, youtube_connections.refresh_token),
        scopes = EXCLUDED.scopes,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    `;

    return finish(request, 'connected');
  } catch {
    return finish(request, 'error');
  }
}
