import { NextResponse } from 'next/server';
import {
  fetchPageActivity,
  fetchPageAudience,
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
  const [target] = await resolvePageTargets(access.workspace.id);
  if (!target) {
    return NextResponse.json({ connected: false }, { headers: NO_STORE });
  }

  try {
    const [audience, activity] = await Promise.all([
      fetchPageAudience(target.id, target.accessToken),
      fetchPageActivity(target.id, target.accessToken),
    ]);

    return NextResponse.json(
      {
        connected: true,
        available: true,
        pageName: audience.pageName,
        fans: audience.fans,
        followers: audience.followers,
        engagements7d: activity.engagements7d,
        mediaViews7d: activity.mediaViews7d,
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
