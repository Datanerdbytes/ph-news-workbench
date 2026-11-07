import { NextResponse } from 'next/server';
import { stripMarkdown } from '@/lib/format';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import {
  crosspostResponse,
  publishToSelectedPages,
} from '@/lib/publishing/crosspost';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import { readPageIds, readText } from '@/lib/publishing/request';
import { parseScheduledPublishTime } from '@/lib/publishing/schedule';
import { MAX_VIDEO_BYTES, publishPageVideo } from '@/lib/publishing/videos';
import { recordNativeSchedule } from '@/lib/schedule-mirror';
import { readMp4DurationSeconds } from '@/lib/reel-meta';

export const dynamic = 'force-dynamic';

const MAX_DURATION_SECONDS = 45 * 60;
const MAX_THUMBNAIL_BYTES = 20 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: Request) {
  const result = await requirePublishingConnection(request, 'publish videos');
  if (result.response) return result.response;

  const { access } = result.context;

  const form = await request.formData().catch(() => null);
  const video = form?.get('video');
  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json(
      { error: 'Choose an MP4 or MOV video.' },
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
  if (video.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: 'Videos must be 1 GB or smaller.' },
      { status: 400 }
    );
  }

  const title = stripMarkdown(readText(form?.get('title'), 200));
  const description = stripMarkdown(readText(form?.get('description'), 5000));
  if (!title && !description) {
    return NextResponse.json(
      { error: 'Add a title or description for the video.' },
      { status: 400 }
    );
  }

  let thumbnail: { bytes: Buffer; type: string; filename: string } | null = null;
  const thumbnailFile = form?.get('thumbnail');
  if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
    if (!IMAGE_TYPES.has(thumbnailFile.type)) {
      return NextResponse.json(
        { error: 'Thumbnails must be JPEG, PNG, or WebP.' },
        { status: 400 }
      );
    }
    if (thumbnailFile.size > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json(
        { error: 'Thumbnails must be 20 MB or smaller.' },
        { status: 400 }
      );
    }
    thumbnail = {
      bytes: Buffer.from(await thumbnailFile.arrayBuffer()),
      type: thumbnailFile.type,
      filename: thumbnailFile.name || 'thumbnail.jpg',
    };
  }

  let feedTargeting = '';
  const rawTargeting = form?.get('feedTargeting');
  if (typeof rawTargeting === 'string' && rawTargeting.trim()) {
    try {
      const parsed = JSON.parse(rawTargeting);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      feedTargeting = JSON.stringify(parsed);
    } catch {
      return NextResponse.json(
        {
          error:
            'Audience targeting must be a JSON object, for example {"geo_locations":{"countries":["PH"]}}.',
        },
        { status: 400 }
      );
    }
  }

  const schedule = parseScheduledPublishTime(form?.get('scheduledFor'));
  if (schedule.error) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  const pageIds = readPageIds(form?.get('pageIds'));
  const videoBytes = Buffer.from(await video.arrayBuffer());
  const duration = readMp4DurationSeconds(videoBytes);
  if (duration !== null && duration > MAX_DURATION_SECONDS) {
    return NextResponse.json(
      {
        error: `Facebook videos must be 45 minutes or shorter. This video is ${Math.round(duration / 60)} minutes.`,
      },
      { status: 400 }
    );
  }

  try {
    const { results } = await publishToSelectedPages({
      workspaceId: access.workspace.id,
      pageIds,
      publish: (page) =>
        publishPageVideo({
          pageId: page.id,
          accessToken: page.accessToken,
          title,
          description,
          video: {
            bytes: videoBytes,
            type: video.type || 'video/mp4',
            filename: video.name || 'video.mp4',
          },
          thumbnail,
          feedTargeting,
          scheduledPublishTime: schedule.unix,
        }),
    });

    await recordNativeSchedule({
      workspaceId: access.workspace.id,
      userId: access.user.id,
      kind: 'video',
      text: title,
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
        kind: 'video',
      }
    );
  } catch (error) {
    return facebookErrorResponse(
      error,
      'video_failed',
      'The video could not be published.'
    );
  }
}
