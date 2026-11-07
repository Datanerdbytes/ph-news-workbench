import { NextResponse } from 'next/server';
import { publishPageReel } from '@/lib/facebook';
import { stripMarkdown } from '@/lib/format';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import {
  crosspostResponse,
  publishToSelectedPages,
} from '@/lib/publishing/crosspost';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import { readPageIds } from '@/lib/publishing/request';
import { parseScheduledPublishTime } from '@/lib/publishing/schedule';
import { recordNativeSchedule } from '@/lib/schedule-mirror';
import { readMp4DurationSeconds } from '@/lib/reel-meta';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 100 * 1024 * 1024;
const MIN_SECONDS = 3;
const MAX_SECONDS = 90;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

export async function POST(request: Request) {
  const result = await requirePublishingConnection(request, 'post a reel');
  if (result.response) return result.response;

  const { access } = result.context;

  const form = await request.formData().catch(() => null);
  const video = form?.get('video');
  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json(
      { error: 'Choose a video file to post as a reel.' },
      { status: 400 }
    );
  }
  if (video.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Reels must be 100 MB or smaller.' },
      { status: 400 }
    );
  }
  const looksLikeVideo =
    VIDEO_TYPES.has(video.type) ||
    (!video.type && /\.(mp4|mov)$/i.test(video.name));
  if (!looksLikeVideo) {
    return NextResponse.json(
      { error: 'Upload an MP4 or MOV video.' },
      { status: 400 }
    );
  }

  const rawCaption = form?.get('caption');
  const caption =
    typeof rawCaption === 'string'
      ? stripMarkdown(rawCaption).trim().slice(0, 2200)
      : '';

  const schedule = parseScheduledPublishTime(form?.get('scheduledFor'));
  if (schedule.error) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  const pageIds = readPageIds(form?.get('pageIds'));
  const videoBytes = Buffer.from(await video.arrayBuffer());
  const durationSeconds = readMp4DurationSeconds(videoBytes);
  if (durationSeconds === null) {
    return NextResponse.json(
      { error: 'Could not read the video length. Upload an MP4 or MOV file.' },
      { status: 400 }
    );
  }
  if (durationSeconds < MIN_SECONDS || durationSeconds > MAX_SECONDS) {
    return NextResponse.json(
      {
        error: `Reels must be ${MIN_SECONDS} to ${MAX_SECONDS} seconds. This clip is ${Math.round(durationSeconds)} seconds.`,
      },
      { status: 400 }
    );
  }

  try {
    const { results } = await publishToSelectedPages({
      workspaceId: access.workspace.id,
      pageIds,
      publish: (page) =>
        publishPageReel({
          pageId: page.id,
          accessToken: page.accessToken,
          caption,
          video: {
            bytes: videoBytes,
            type: video.type || 'video/mp4',
            filename: video.name || 'reel.mp4',
          },
          scheduledPublishTime: schedule.unix,
        }),
    });

    // The reel exists on Facebook now; mirror it into scheduled_posts so the
    // Calendar and Analytics see it. Facebook stays the executor (including
    // native scheduling) — the local scheduler syncs these rows' status
    // instead of publishing them.
    await recordNativeSchedule({
      workspaceId: access.workspace.id,
      userId: access.user.id,
      kind: 'reel',
      text: caption,
      scheduledFor: schedule.unix ? new Date(schedule.unix * 1000) : null,
      results,
    });

    return crosspostResponse(
      results,
      {
        scheduledFor: schedule.unix
          ? new Date(schedule.unix * 1000).toISOString()
          : null,
      },
      {
        workspaceId: access.workspace.id,
        actorUserId: access.user.id,
        kind: 'reel',
      }
    );
  } catch (error) {
    return facebookErrorResponse(
      error,
      'reel_failed',
      'The reel could not be posted.'
    );
  }
}
