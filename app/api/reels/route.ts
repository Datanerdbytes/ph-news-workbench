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
import { MAX_VIDEO_BYTES, publishPageVideo } from '@/lib/publishing/videos';
import { notifyPublishAttemptFailure } from '@/lib/notifications';
import { recordNativeSchedule } from '@/lib/schedule-mirror';
import { readMp4DurationSeconds } from '@/lib/reel-meta';

export const dynamic = 'force-dynamic';
// Blob download is same-network and fast; the Facebook rupload transfer owns
// the budget. Vercel Hobby's ceiling is 60s for Node functions.
export const maxDuration = 60;

const MAX_BYTES = MAX_VIDEO_BYTES;
const MIN_SECONDS = 3;
// The Reels Publishing API (POST /{page-id}/video_reels, used for ≤ 90s
// clips) hard-caps duration at 3–90 seconds — Meta rejects longer uploads
// there with error 1363128. Facebook itself no longer limits reel length
// (Business Help: "no minimum or maximum length requirement"), and its
// chunked video upload documented envelope is 45 minutes / 1.75 GB. Clips
// between 90 seconds and 45 minutes therefore publish through the Video API
// (POST /{page-id}/videos) — every video on Facebook is shared as a reel
// since Meta's June 2025 migration, so they surface identically.
const REEL_API_MAX_SECONDS = 90;
const MAX_SECONDS = 45 * 60;
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

  // Hard content rejections ring the bell too — the workspace stays aware of
  // failed post attempts after the composer's toast is gone.
  const notifyFailure = (reason: string) =>
    notifyPublishAttemptFailure({
      workspaceId: access.workspace.id,
      kind: 'reel',
      reason,
    });

  // Staged video: browser -> Blob -> server. The staging helper authenticates
  // the URL against our store, so a fabricated or foreign URL is refused.
  let videoBytes: Buffer;
  try {
    videoBytes = await stagedFileToBuffer(videoUrl);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'The staged video could not be read.';
    await notifyFailure(message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (videoBytes.length === 0) {
    const message = 'The staged video is empty.';
    await notifyFailure(message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (videoBytes.length > MAX_BYTES) {
    const message = 'Reels must be 1 GB or smaller.';
    await notifyFailure(message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const durationSeconds = readMp4DurationSeconds(videoBytes);
  if (durationSeconds === null) {
    const message =
      'Could not read the video length. Upload an MP4 or MOV file.';
    await notifyFailure(message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (durationSeconds < MIN_SECONDS || durationSeconds > MAX_SECONDS) {
    const message = `Reels must be ${MIN_SECONDS} seconds to ${Math.floor(MAX_SECONDS / 60)} minutes. This clip is ${durationSeconds >= 60 ? `${Math.floor(durationSeconds / 60)} minutes` : `${Math.round(durationSeconds)} seconds`}.`;
    await notifyFailure(message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { results } = await publishToSelectedPages({
      workspaceId: access.workspace.id,
      pageIds,
      publish: (page) =>
        // ≤ 90s rides the Reels rupload (fast, single request); longer clips
        // go through the chunked Video API, which Meta shares as reels.
        durationSeconds <= REEL_API_MAX_SECONDS
          ? publishPageReel({
              pageId: page.id,
              accessToken: page.accessToken,
              caption,
              video: {
                bytes: videoBytes,
                type: videoType,
                filename,
              },
              scheduledPublishTime: schedule.unix,
            })
          : publishPageVideo({
              pageId: page.id,
              accessToken: page.accessToken,
              description: caption,
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
      'The reel could not be posted.',
      {
        workspaceId: access.workspace.id,
        kind: 'reel',
      }
    );
  } finally {
    // The staging copy is transient regardless of outcome — Facebook either
    // has the video, or the user re-stages a fresh file on retry.
    await deleteStagedBlobs([videoUrl]);
  }
}
