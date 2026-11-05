import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { decryptToken, encryptToken } from '@/lib/facebook-token';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import {
  createPageLiveVideo,
  fetchPageLiveVideo,
} from '@/lib/publishing/live';
import { readText } from '@/lib/publishing/request';
import { parseScheduledPublishTime } from '@/lib/publishing/schedule';
import { recordNativeSchedule } from '@/lib/schedule-mirror';

export const dynamic = 'force-dynamic';

type StreamRow = {
  id: number;
  facebook_video_id: string;
  title: string;
  description: string | null;
  status: string;
  stream_key: string | null;
  secure_stream_url: string | null;
  permalink_url: string | null;
  planned_start_time: string | Date | null;
  created_at: string | Date;
};

function splitStreamUrl(value: string | null) {
  if (!value) return { base: null, key: null };
  const match = value.match(/^(.*\/)([^/]+)\/?$/);
  if (!match) return { base: value, key: null };
  return { base: match[1], key: match[2] };
}

function toStream(row: StreamRow) {
  let streamKey: string | null = null;
  if (row.stream_key) {
    try {
      streamKey = decryptToken(row.stream_key);
    } catch {
      streamKey = null;
    }
  }
  return {
    id: row.id,
    facebookVideoId: row.facebook_video_id,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    streamKey,
    secureStreamUrl: row.secure_stream_url,
    permalink: row.permalink_url,
    plannedStartTime: row.planned_start_time,
    createdAt: row.created_at,
  };
}

async function loadRows(
  workspaceId: string,
  refresh: boolean,
  accessToken: string
): Promise<StreamRow[]> {
  const rows = (await sql`
    SELECT id, facebook_video_id, title, description, status, stream_key,
           secure_stream_url, permalink_url, planned_start_time, created_at
    FROM live_streams
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC
    LIMIT 50
  `) as unknown as StreamRow[];

  if (!refresh) return rows;

  for (const row of rows) {
    if (row.status === 'ENDED' || row.status === 'VOD') continue;
    try {
      const live = await fetchPageLiveVideo(row.facebook_video_id, accessToken);
      row.status = live.status;
      row.title = live.title || row.title;
      row.description = live.description || row.description;
      row.permalink_url = live.permalink ?? row.permalink_url;
      await sql`
        UPDATE live_streams
        SET status = ${row.status}, title = ${row.title},
            description = ${row.description}, permalink_url = ${row.permalink_url},
            updated_at = now()
        WHERE id = ${row.id} AND workspace_id = ${workspaceId}
      `;
    } catch {
      // A stream that Facebook no longer returns keeps its stored state.
    }
  }

  return rows;
}

export async function GET(request: Request) {
  const result = await requirePublishingConnection(request, 'load live streams');
  if (result.response) return result.response;

  const refresh = new URL(request.url).searchParams.get('refresh') === '1';

  try {
    const rows = await loadRows(
      result.context.access.workspace.id,
      refresh,
      result.context.connection.accessToken
    );
    return NextResponse.json(
      { streams: rows.map(toStream) },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    return facebookErrorResponse(
      error,
      'live_load_failed',
      'Could not load live streams.'
    );
  }
}

export async function POST(request: Request) {
  const result = await requirePublishingConnection(request, 'create a live stream');
  if (result.response) return result.response;

  const { access, connection } = result.context;
  const body = await request.json().catch(() => null);
  const title = readText(body?.title, 200);
  const description = readText(body?.description, 5000);
  if (!title) {
    return NextResponse.json(
      { error: 'Give the live stream a title.' },
      { status: 400 }
    );
  }

  const schedule = parseScheduledPublishTime(body?.scheduledFor);
  if (schedule.error) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  try {
    const live = await createPageLiveVideo({
      pageId: connection.pageId,
      accessToken: connection.accessToken,
      title,
      description,
      plannedStartTime: schedule.unix,
    });

    const secure = splitStreamUrl(live.secureStreamUrl ?? live.streamUrl);
    const storedKey = secure.key ? encryptToken(secure.key) : null;
    const planned =
      live.plannedStartTime ??
      (schedule.unix ? new Date(schedule.unix * 1000).toISOString() : null);

    const rows = (await sql`
      INSERT INTO live_streams
        (workspace_id, facebook_video_id, title, description, status,
         stream_key, secure_stream_url, permalink_url, planned_start_time, created_by)
      VALUES
        (${access.workspace.id}, ${live.id}, ${live.title}, ${live.description},
         ${live.status}, ${storedKey}, ${secure.base}, ${live.permalink},
         ${planned}, ${access.user.id})
      ON CONFLICT (workspace_id, facebook_video_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        stream_key = EXCLUDED.stream_key,
        secure_stream_url = EXCLUDED.secure_stream_url,
        permalink_url = EXCLUDED.permalink_url,
        planned_start_time = EXCLUDED.planned_start_time,
        updated_at = now()
      RETURNING id, facebook_video_id, title, description, status, stream_key,
                secure_stream_url, permalink_url, planned_start_time, created_at
    `) as unknown as StreamRow[];

    // A planned live stream is held by Facebook until its start time. Mirror
    // it so the Calendar and Analytics can see it alongside every other
    // scheduled item.
    await recordNativeSchedule({
      workspaceId: access.workspace.id,
      userId: access.user.id,
      kind: 'live',
      text: live.title,
      scheduledFor: schedule.unix ? new Date(schedule.unix * 1000) : null,
      results: [
        {
          page: { id: connection.pageId, name: connection.pageName },
          ok: true,
          id: live.id,
          permalink: live.permalink ?? null,
        },
      ],
    });

    return NextResponse.json(
      {
        stream: { ...toStream(rows[0]), streamKey: secure.key },
        page: { id: connection.pageId, name: connection.pageName },
      },
      { status: 201 }
    );
  } catch (error) {
    return facebookErrorResponse(
      error,
      'live_create_failed',
      'The live stream could not be created.'
    );
  }
}
