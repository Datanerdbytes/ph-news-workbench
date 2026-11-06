import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getWorkspaceForUser } from '@/lib/workspaces';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  facebookConfigured,
  fetchGrantedScopes,
  fetchPages,
  redactTokens,
  selectPage,
} from '@/lib/facebook';
import { encryptToken } from '@/lib/facebook-token';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'fb_oauth_state';

function matchesState(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function finish(request: NextRequest, outcome: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('facebook', outcome);

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
    return finish(request, denied === 'access_denied' ? 'denied' : 'error');
  }

  if (!facebookConfigured()) {
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
    return NextResponse.redirect(new URL('/login', request.url));
  }

  let outcome = 'error';

  try {
    const shortLivedToken = await exchangeCodeForToken(code);
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken);
    const pages = await fetchPages(longLivedToken);

    if (!pages.length) {
      outcome = 'no_pages';
    } else {
      const page = selectPage(pages, process.env.FACEBOOK_PAGE_ID?.trim());

      if (!page) {
        outcome = 'page_not_found';
      } else {
        const scopes = await fetchGrantedScopes(longLivedToken).catch(() => []);
        const encryptedToken = encryptToken(page.accessToken);
        const workspace = await getWorkspaceForUser(session.user);

        await sql`
          INSERT INTO facebook_connections
            (workspace_id, user_id, page_id, page_name, access_token, scopes, connected_at, updated_at)
          VALUES
            (${workspace.id}, ${session.user.id}, ${page.id}, ${page.name}, ${encryptedToken}, ${scopes.join(',')}, now(), now())
          ON CONFLICT (workspace_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            page_id = EXCLUDED.page_id,
            page_name = EXCLUDED.page_name,
            access_token = EXCLUDED.access_token,
            scopes = EXCLUDED.scopes,
            updated_at = now()
        `;

        await sql`
          DELETE FROM facebook_pages
          WHERE workspace_id = ${workspace.id}
        `;

        for (const managed of pages) {
          await sql`
            INSERT INTO facebook_pages
              (workspace_id, page_id, page_name, access_token, page_picture_url, is_primary, updated_at)
            VALUES
              (${workspace.id}, ${managed.id}, ${managed.name},
               ${encryptToken(managed.accessToken)}, ${managed.picture}, ${managed.id === page.id}, now())
          `;
        }

        outcome = 'connected';
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? redactTokens(error.message) : 'Unknown error';
    console.error(
      JSON.stringify({ route: 'facebook/callback', event: 'failed', message })
    );
  }

  return finish(request, outcome);
}
