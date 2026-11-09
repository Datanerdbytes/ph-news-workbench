import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getWorkspaceForUser } from '@/lib/workspaces';
import {
  clearOAuthCookies,
  resolveReturnPath,
  returnUrl,
} from '@/lib/oauth-return';
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
import {
  clearNotificationsByDedupeKey,
  notifyWorkspace,
  TOKEN_INVALID_DEDUPE_KEY,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'fb_oauth_state';
const NEXT_COOKIE = 'fb_oauth_next';
const CHANNEL_COOKIE = 'fb_oauth_channel';

function matchesState(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function finish(request: NextRequest, outcome: string) {
  // Instagram starts this same flow; tag its outcome so only the Instagram
  // hook reacts. Anything else reads as a Facebook connection result.
  const channel = request.cookies.get(CHANNEL_COOKIE)?.value;
  const isInstagram = channel === 'instagram';
  // A successful grant drops the actor straight into that platform's
  // publishing UI; failures return to wherever Connect was clicked.
  const path = resolveReturnPath(
    request.cookies.get(NEXT_COOKIE)?.value ?? null,
    outcome,
    isInstagram ? '/instagram' : '/post',
    '/'
  );
  const response = NextResponse.redirect(
    returnUrl(request, path, isInstagram ? 'instagram' : 'facebook', outcome)
  );
  clearOAuthCookies(response, [STATE_COOKIE, NEXT_COOKIE, CHANNEL_COOKIE]);
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const denied = params.get('error');

  if (denied) {
    const outcome = denied === 'access_denied' ? 'denied' : 'error';
    // The actor saw the redirect toast; the workspace learns from the bell.
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (session) {
        const workspace = await getWorkspaceForUser(session.user);
        await notifyWorkspace({
          workspaceId: workspace.id,
          type: 'facebook_oauth_failed',
          title: 'Facebook connection was not completed',
          body:
            outcome === 'denied'
              ? 'Facebook authorization was denied, so publishing stays offline until the Pages are connected.'
              : 'The Facebook connection attempt failed before authorization.',
          link: '/settings',
          excludeUserIds: [session.user.id],
        });
      }
    } catch {
      // Best-effort on this early path — the redirect must still go out.
    }
    return finish(request, outcome);
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
  const workspace = await getWorkspaceForUser(session.user);

  try {
    const shortLivedToken = await exchangeCodeForToken(code);
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken);
    const pages = await fetchPages(longLivedToken);

    if (!pages.length) {
      outcome = 'no_pages';
      await notifyWorkspace({
        workspaceId: workspace.id,
        type: 'facebook_oauth_failed',
        title: 'Facebook connection returned no Pages',
        body: 'The connected Facebook account manages no Pages, so nothing can publish. Check the account and reconnect.',
        link: '/settings',
        excludeUserIds: [session.user.id],
      });
    } else {
      const page = selectPage(pages, process.env.FACEBOOK_PAGE_ID?.trim());

      if (!page) {
        outcome = 'page_not_found';
        await notifyWorkspace({
          workspaceId: workspace.id,
          type: 'facebook_oauth_failed',
          title: 'Facebook Page not found',
          body: 'The expected Facebook Page was not found on the connected account. Check the Page setting and reconnect.',
          link: '/settings',
          excludeUserIds: [session.user.id],
        });
      } else {
        const scopes = await fetchGrantedScopes(longLivedToken).catch(() => []);
        const encryptedToken = encryptToken(page.accessToken);

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

        // The reconnect resolves every outstanding "token invalid" alert.
        await clearNotificationsByDedupeKey(
          workspace.id,
          TOKEN_INVALID_DEDUPE_KEY
        );
        await notifyWorkspace({
          workspaceId: workspace.id,
          type: 'facebook_reconnected',
          title: 'Facebook Pages connected',
          body: `${page.name} is connected again. Publishing is back online.`,
          link: '/settings',
          excludeUserIds: [session.user.id],
        });

        outcome = 'connected';
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? redactTokens(error.message) : 'Unknown error';
    console.error(
      JSON.stringify({ route: 'facebook/callback', event: 'failed', message })
    );
    await notifyWorkspace({
      workspaceId: workspace.id,
      type: 'facebook_oauth_failed',
      title: 'Facebook connection failed',
      body: message.slice(0, 200),
      link: '/settings',
      excludeUserIds: [session.user.id],
    });
  }

  return finish(request, outcome);
}
