import { NextResponse } from 'next/server';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { assertStagedBlob } from '@/lib/blob';
import { ensureFreshYouTubeToken, YouTubeAuthError } from '@/lib/youtube';
import { requirePlatformConnection } from '@/lib/publishing/connection';
import { publishYouTubeVideo, type YouTubePublishResult } from '@/lib/publishing/youtube';
import { parseScheduledPublishTime } from '@/lib/publishing/schedule';
import { recordNativeSchedule } from '@/lib/schedule-mirror';
import { youtubeErrorResponse } from '@/lib/publishing/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const result = await requirePlatformConnection(
    request,
    'youtube',
    'publish a video'
  );
  if (result.response) return result.response;

  const { access, connection } = result.context;
  const workspaceId = access.workspace.id;

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    description?: unknown;
    privacyStatus?: unknown;
    madeForKids?: unknown;
    videoUrl?: unknown;
    scheduledFor?: unknown;
  } | null;

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description =
    typeof body?.description === 'string' ? body.description : '';
  const madeForKids = body?.madeForKids === true;
  const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';

  // publishAt requires the video to sit in Private — YouTube flips it public
  // at the scheduled moment, so a scheduled upload must not ship as public.
  const schedule = parseScheduledPublishTime(body?.scheduledFor);
  if (schedule.error) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }
  const scheduled = schedule.unix !== null;
  const privacyStatus = scheduled
    ? 'private'
    : body?.privacyStatus === 'public' ||
        body?.privacyStatus === 'unlisted' ||
        body?.privacyStatus === 'private'
      ? body.privacyStatus
      : 'private';

  if (title.length < 1 || title.length > 100) {
    return NextResponse.json(
      { error: 'Give the video a title between 1 and 100 characters.' },
      { status: 400 }
    );
  }
  if (description.length > 5000) {
    return NextResponse.json(
      { error: 'Descriptions are capped at 5,000 characters.' },
      { status: 400 }
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

  let token: string;
  try {
    token = await ensureFreshYouTubeToken(connection, workspaceId);
  } catch (error) {
    if (error instanceof YouTubeAuthError) {
      return NextResponse.json(
        { error: error.message, code: 'permission' },
        { status: 403 }
      );
    }
    return youtubeErrorResponse(error, 'publish_failed', 'The YouTube session failed.', {
      workspaceId,
      kind: 'youtube-video',
    });
  }

  try {
    const published: YouTubePublishResult = await publishYouTubeVideo({
      accessToken: token,
      metadata: {
        title,
        description,
        privacyStatus,
        madeForKids,
        ...(scheduled
          ? { publishAt: new Date(schedule.unix! * 1000).toISOString() }
          : {}),
      },
      videoUrl,
    });

    // Mirror into the calendar — 'scheduled' when the slot is in the future
    // (the worker probes YouTube until publishAt flips the video public),
    // 'published' for immediate uploads so Analytics counts them.
    await recordNativeSchedule({
      workspaceId,
      userId: access.user.id,
      kind: 'video',
      text: title,
      scheduledFor: scheduled
        ? new Date(schedule.unix! * 1000)
        : null,
      results: [
        {
          page: {
            id: connection.platformUserId,
            name: connection.username,
          },
          ok: true,
          id: published.id,
          permalink: published.permalink,
        },
      ],
      platform: 'youtube',
    });

    return NextResponse.json(
      {
        id: published.id,
        permalink: published.permalink,
        scheduledFor: scheduled
          ? new Date(schedule.unix! * 1000).toISOString()
          : null,
        account: { id: connection.platformUserId, name: connection.username },
      },
      { status: 201 }
    );
  } catch (error) {
    // Staging copies stop being useful the moment YouTube either owns the
    // bytes or refuses them; deleting keeps the blob bucket clean.
    return youtubeErrorResponse(error, 'publish_failed', 'YouTube rejected the upload.', {
      workspaceId,
      kind: 'youtube-video',
    });
  }
}
