import { NextResponse } from 'next/server';
import { publishPageReel } from '@/lib/facebook';
import { stripMarkdown } from '@/lib/format';
import { deleteStagedBlobs, stagedFileToBuffer } from '@/lib/blob';
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
// Blob download is same-network and fast; the Facebook rupload transfer owns
// the budget. Vercel Hobby's ceiling is 60s for Node functions.
export const maxDuration = 60;

const MAX_BYTES = 100 * 1024 * 1024;
const MIN_SECONDS = 3;
const MAX_SECONDS = 90;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

type ReelPostBody = {
  videoUrl?: unknown;
  filename?: unknown;
  videoType?: unknown;
  caption?: unknown;
  scheduledFor?: unknown;
  pageIds?: unknown;
};

export async function POST(request: Request) {
  const result = await requirePublishingConnection(request, 'post a reel');
  if (result.response) return result.response;

  const { access } = result.context;

  const body = (await request.json().catch(() => null)) as ReelPostBody | null;
  const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl : '';
  if (!videoUrl) {
    return NextResponse.json(
      { error: 'Stage the video first, then post the reel.' },
      { status: 400 }
    );
  }

  const filename =
    typeof body?.filename === 'string' && body.filename.trim()
      ? body.filename
      : 'reel.mp4';
  const videoType =
    typeof body?.videoType === 'string' && VIDEO_TYPES.has(body.videoType)
      ? body.videoType
      : 'video/mp4';

  const rawCaption = typeof body?.caption === 'string' ? body.caption : '';
  const caption = stripMarkdown(rawCaption).trim().slice(0, 2200);

  const schedule = parseScheduledPublishTime(body?.scheduledFor);
  if (schedule.error) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  const pageIds = readPageIds(body?.pageIds);

  // Staged video: browser -> Blob -> server. The staging helper authenticates
  // the URL against our store, so a fabricated or foreign URL is refused.
  let videoBytes: Buffer;
  try {
    videoBytes = await stagedFileToBuffer(videoUrl);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The staged video could not be read.',
      },
      { status: 400 }
    );
  }

  if (videoBytes.length === 0) {
    return NextResponse.json(
      { error: 'The staged video is empty.' },
      { status: 400 }
    );
  }
  if (videoBytes.length > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Reels must be 100 MB or smaller.' },
      { status: 400 }
    );
  }
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
            type: videoType,
            filename,
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
  } finally {
    // The staging copy is transient regardless of outcome — Facebook either
    // has the video, or the user re-stages a fresh file on retry.
    await deleteStagedBlobs([videoUrl]);
  }
}
