import { NextResponse } from 'next/server';
import {
  ensureFreshYouTubeToken,
  fetchYouTubeChannel,
  fetchYouTubeRecentVideos,
  googleConfigured,
  YouTubeAuthError,
} from '@/lib/youtube';
import { requirePlatformConnection } from '@/lib/publishing/connection';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** Channel overview + recent-upload stats for the Analytics page. Uses
 * `mine=true` so it never depends on the stored channel-id sentinel. */
export async function GET(request: Request) {
  const result = await requirePlatformConnection(
    request,
    'youtube',
    'read YouTube insights'
  );
  if (result.response) return result.response;

  const { access, connection } = result.context;
  const workspaceId = access.workspace.id;

  if (!googleConfigured()) {
    return NextResponse.json(
      { connected: false, configured: false },
      { headers: NO_STORE }
    );
  }

  let token: string;
  try {
    token = await ensureFreshYouTubeToken(connection, workspaceId);
  } catch (error) {
    return NextResponse.json(
      {
        connected: true,
        reason:
          error instanceof YouTubeAuthError
            ? error.message
            : 'The YouTube token could not be refreshed.',
      },
      { headers: NO_STORE }
    );
  }

  try {
    const channel = await fetchYouTubeChannel(token);
    if (!channel) {
      return NextResponse.json(
        {
          connected: true,
          channel: null,
          reason: 'No YouTube channel exists on this Google account.',
        },
        { headers: NO_STORE }
      );
    }
    const recent = await fetchYouTubeRecentVideos(token, channel.id).catch(
      () => []
    );
    return NextResponse.json(
      { connected: true, channel, recent },
      { headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json(
      {
        connected: true,
        channel: null,
        reason:
          error instanceof Error
            ? error.message
            : 'YouTube insights are unavailable.',
      },
      { headers: NO_STORE }
    );
  }
}
