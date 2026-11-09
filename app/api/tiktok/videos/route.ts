import { NextResponse } from 'next/server';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { assertStagedBlob } from '@/lib/blob';
import { ensureFreshTikTokToken, TikTokAuthError, tiktokPublicPostingApproved } from '@/lib/tiktok';
import { requirePlatformConnection } from '@/lib/publishing/connection';
import { publishTikTokVideo, type TikTokPublishResult } from '@/lib/publishing/tiktok';
import { tiktokErrorResponse } from '@/lib/publishing/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const result = await requirePlatformConnection(
    request,
    'tiktok',
    'publish a video'
  );
  if (result.response) return result.response;

  const { access, connection } = result.context;
  const workspaceId = access.workspace.id;

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    privacyStatus?: unknown;
    videoUrl?: unknown;
  } | null;

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const privacyStatus =
    body?.privacyStatus === 'PUBLIC_TO_EVERYONE' ||
    body?.privacyStatus === 'MUTUAL_FOLLOW_FRIENDS' ||
    body?.privacyStatus === 'SELF_ONLY'
      ? body.privacyStatus
      : null;

  if (title.length < 1 || title.length > 2200) {
    return NextResponse.json(
      { error: 'Give the video a caption between 1 and 2,200 characters.' },
      { status: 400 }
    );
  }
  if (!privacyStatus) {
    return NextResponse.json(
      { error: 'Choose a visibility level for the post.' },
      { status: 400 }
    );
  }
  if (privacyStatus !== 'SELF_ONLY' && !tiktokPublicPostingApproved()) {
    // Sandbox gate: TikTok only permits self-only posts until the app and
    // its Content Posting API survive app review.
    return NextResponse.json(
      {
        error:
          'TikTok posts stay private until the app is approved. Set TIKTOK_PUBLIC_POSTING=true after review to enable public posting.',
        code: 'approval_pending',
      },
      { status: 403 }
    );
  }
  if (!videoUrl) {
    return NextResponse.json(
      { error: 'Choose a video file to upload.' },
      { status: 400 }
    );
  }
  if (!videoUrl.includes('.public.blob.vercel-storage.com')) {
    return NextResponse.json(
      { error: 'The video is not a staged workbench upload.' },
      { status: 400 }
    );
  }

  await assertStagedBlob(videoUrl).catch(() => null);

  let token: string;
  try {
    token = await ensureFreshTikTokToken(connection, workspaceId);
  } catch (error) {
    if (error instanceof TikTokAuthError) {
      return NextResponse.json(
        { error: error.message, code: 'permission' },
        { status: 403 }
      );
    }
    return tiktokErrorResponse(error, 'publish_failed', 'The TikTok session failed.', {
      workspaceId,
      kind: 'tiktok-video',
    });
  }

  try {
    const published: TikTokPublishResult = await publishTikTokVideo({
      accessToken: token,
      metadata: { title, privacyStatus },
      videoUrl,
    });

    return NextResponse.json(
      {
        id: published.id,
        permalink: published.permalink,
        account: { id: connection.platformUserId, name: connection.username },
        status: 'processing',
      },
      { status: 201 }
    );
  } catch (error) {
    return tiktokErrorResponse(error, 'publish_failed', 'TikTok rejected the post.', {
      workspaceId,
      kind: 'tiktok-video',
    });
  }
}
