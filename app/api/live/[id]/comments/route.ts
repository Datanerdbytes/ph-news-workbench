import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import { fetchLiveComments } from '@/lib/publishing/live';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePublishingConnection(request, 'read live comments');
  if (result.response) return result.response;

  const { access, connection } = result.context;
  const { id } = await params;

  const rows = (await sql`
    SELECT facebook_video_id
    FROM live_streams
    WHERE workspace_id = ${access.workspace.id}
      AND (facebook_video_id = ${id} OR id::text = ${id})
  `) as unknown as { facebook_video_id: string }[];

  if (!rows[0]) {
    return NextResponse.json({ error: 'Live stream not found.' }, { status: 404 });
  }

  const after = new URL(request.url).searchParams.get('after');

  try {
    const comments = await fetchLiveComments({
      liveVideoId: rows[0].facebook_video_id,
      accessToken: connection.accessToken,
      after,
    });
    return NextResponse.json(comments, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return facebookErrorResponse(
      error,
      'live_comments_failed',
      'Could not load live comments.'
    );
  }
}
