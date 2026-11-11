import { NextResponse } from 'next/server';
import {
  fetchInstagramOverview,
  fetchPageActivity,
  fetchPageAudience,
  fetchPageTopPosts,
  redactTokens,
} from '@/lib/facebook';
import { resolvePageTargets } from '@/lib/publishing/connection';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  // Report on the page the workspace publishes as, not the legacy
  // facebook_connections row, so analytics follow the selected page.
  const targets = await resolvePageTargets(access.workspace.id);
  const target = targets[0];
  if (!target) {
    return NextResponse.json({ connected: false }, { headers: NO_STORE });
  }

  // Each section degrades on its own: an audience failure keeps the card
  // from rendering, while posts/instagram just hide their own sections.
  try {
    const [audience, activity, topPostsResult] = await Promise.all([
      fetchPageAudience(target.id, target.accessToken),
      fetchPageActivity(target.id, target.accessToken),
      fetchPageTopPosts(target.id, target.accessToken).then(
        (topPosts) => ({ topPosts, topPostsError: null as string | null }),
        (error: unknown) => ({
          topPosts: null,
          topPostsError: redactTokens(
            error instanceof Error ? error.message : 'Posts are unavailable.'
          ),
        })
      ),
    ]);

    // The workspace's Instagram presence may hang off any connected page,
    // so probe each until one has a professional account linked.
    const allTargets = await resolvePageTargets(access.workspace.id, [], {
      all: true,
    });
    let instagram = null;
    let instagramError: string | null = null;
    for (const page of allTargets) {
      try {
        const overview = await fetchInstagramOverview(page.id, page.accessToken);
        if (overview) {
          instagram = overview;
          instagramError = null;
          break;
        }
      } catch (error) {
        instagramError = redactTokens(
          error instanceof Error
            ? error.message
            : 'Instagram insights are unavailable.'
        );
      }
    }

    return NextResponse.json(
      {
        connected: true,
        available: true,
        pageName: audience.pageName,
        fans: audience.fans,
        followers: audience.followers,
        engagements7d: activity.engagements7d,
        mediaViews7d: activity.mediaViews7d,
        topPosts: topPostsResult.topPosts,
        topPostsError: topPostsResult.topPostsError,
        instagram,
        instagramError,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    const reason =
      error instanceof Error
        ? redactTokens(error.message)
        : 'Facebook insights are unavailable.';

    return NextResponse.json(
      {
        connected: true,
        available: false,
        pageName: target.name,
        reason,
      },
      { headers: NO_STORE }
    );
  }
}
