import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { decryptToken } from '@/lib/facebook-token';
import { stripMarkdown } from '@/lib/format';
import { readMp4DurationSeconds } from '@/lib/reel-meta';
import {
  FacebookApiError,
  publishPageReel,
  redactTokens,
} from '@/lib/facebook';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 100 * 1024 * 1024;
const MIN_SECONDS = 3;
const MAX_SECONDS = 90;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

type ConnectionRow = {
  page_id: string;
  page_name: string;
  access_token: string;
  scopes: string | null;
};

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const rows = (await sql`
    SELECT page_id, page_name, access_token, scopes
    FROM facebook_connections
    WHERE workspace_id = ${access.workspace.id}
  `) as unknown as ConnectionRow[];

  const connection = rows[0];
  if (!connection) {
    return NextResponse.json(
      { error: 'Connect your Facebook Page before posting a reel.', code: 'not_connected' },
      { status: 409 }
    );
  }

  const scopes = (connection.scopes ?? '').split(',').filter(Boolean);
  if (!scopes.includes('pages_manage_posts')) {
    return NextResponse.json(
      {
        error:
          'This connection cannot post reels. Reconnect the Page to grant pages_manage_posts.',
        code: 'scope_missing',
      },
      { status: 403 }
    );
  }

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
    const accessToken = decryptToken(connection.access_token);
    const reel = await publishPageReel({
      pageId: connection.page_id,
      accessToken,
      caption,
      video: {
        bytes: videoBytes,
        type: video.type || 'video/mp4',
        filename: video.name || 'reel.mp4',
      },
    });

    return NextResponse.json(
      {
        id: reel.id,
        permalink: reel.permalink,
        page: { id: connection.page_id, name: connection.page_name },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof FacebookApiError) {
      const permissionIssue =
        error.code === 10 || error.code === 200 || error.code === 190;
      if (permissionIssue) {
        return NextResponse.json(
          {
            error: `${redactTokens(error.message)} Reconnect the Page to refresh its permissions.`,
            code: 'permission',
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: redactTokens(error.message), code: 'reel_failed' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'The reel could not be posted.', code: 'reel_failed' },
      { status: 500 }
    );
  }
}
