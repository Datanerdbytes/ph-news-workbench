import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getWorkspaceForUser } from '@/lib/workspaces';
import {
  clearOAuthCookies,
  resolveReturnPath,
  returnUrl,
} from '@/lib/oauth-return';
import {
  encryptTikTokSecret,
  exchangeTikTokCode,
  fetchTikTokUser,
  tiktokConfigured,
} from '@/lib/tiktok';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'tt_oauth_state';
const VERIFIER_COOKIE = 'tt_pkce_verifier';
const NEXT_COOKIE = 'tt_oauth_next';

function matchesState(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function finish(request: NextRequest, outcome: string) {
  // A successful grant lands in the TikTok composer; failures return to
  // wherever Connect was clicked so the outcome toast is seen there.
  const path = resolveReturnPath(
    request.cookies.get(NEXT_COOKIE)?.value ?? null,
    outcome,
    '/tiktok',
    '/tiktok'
  );
  const response = NextResponse.redirect(
    returnUrl(request, path, 'platform', outcome)
  );
  clearOAuthCookies(response, [STATE_COOKIE, VERIFIER_COOKIE, NEXT_COOKIE]);
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const denied = params.get('error');

  if (denied) {
    const outcome = denied === 'access_denied' ? 'denied' : 'error';
    return finish(request, outcome);
  }

  if (!tiktokConfigured()) {
    return finish(request, 'unconfigured');
  }

  const state = params.get('state') ?? '';
  const expectedState = request.cookies.get(STATE_COOKIE)?.value ?? '';
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value ?? '';
  if (
    !state ||
    !expectedState ||
    !verifier ||
    !matchesState(state, expectedState)
  ) {
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
    // PKCE: the code only resolves against the verifier minted at connect.
    const token = await exchangeTikTokCode(code, verifier);
    let userId = 'unknown';
    let username = 'TikTok';
    try {
      const user = await fetchTikTokUser(token.accessToken);
      if (user) {
        userId = user.id;
        username = user.name;
      }
    } catch {
      // Profile probe is cosmetic; the grant itself is valid and stored.
    }

    await sql`
      INSERT INTO tiktok_connections (
        workspace_id, user_id, tiktok_user_id, username,
        access_token, refresh_token, scopes, expires_at
      )
      VALUES (
        ${workspace.id}, ${session.user.id}, ${userId}, ${username},
        ${encryptTikTokSecret(token.accessToken)},
        ${token.refreshToken ? encryptTikTokSecret(token.refreshToken) : null},
        ${token.scope.join(',')},
        ${token.expiresAt}
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        tiktok_user_id = EXCLUDED.tiktok_user_id,
        username = EXCLUDED.username,
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, tiktok_connections.refresh_token),
        scopes = EXCLUDED.scopes,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    `;

    return finish(request, 'connected');
  } catch {
    return finish(request, 'error');
  }
}
