import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { stripMarkdown } from '@/lib/format';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { assertStagedBlob } from '@/lib/blob';
import {
  publishInstagramImagePost,
  resolveInstagramAccount,
} from '@/lib/publishing/instagram';
import { parseScheduledPublishTime } from '@/lib/publishing/schedule';
import { recordScheduleEvent } from '@/lib/schedule-events';
import { instagramErrorResponse } from '@/lib/publishing/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const workspaceId = access.workspace.id;
  const connection = await resolveInstagramAccount(workspaceId);
  if (!connection.ok) {
    if (connection.reason === 'not_connected') {
      return NextResponse.json(
        {
          error:
            'Connect your Facebook Page with Instagram permissions before posting to Instagram.',
          code: 'not_connected',
        },
        { status: 409 }
      );
    }
    if (connection.reason === 'scope_missing') {
      return NextResponse.json(
        {
          error: `Reconnect to grant ${connection.detail ?? 'the Instagram scopes'} before posting.`,
          code: 'scope_missing',
        },
        { status: 403 }
      );
    }
    if (connection.reason === 'no_ig_account') {
      return NextResponse.json(
        {
          error:
            connection.detail ??
            'This Page has no professional Instagram account linked to it.',
          code: 'no_ig_account',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: `Could not verify the Instagram connection${
          connection.detail ? `: ${connection.detail}` : '.'
        }`,
        code: 'probe_failed',
      },
      { status: 502 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    imageUrl?: unknown;
    scheduledFor?: unknown;
  } | null;
  const caption = stripMarkdown(
    typeof body?.message === 'string' ? body.message : ''
  ).slice(0, 2200);
  const imageUrl =
    typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';

  if (!imageUrl) {
    return NextResponse.json(
      { error: 'Choose an image to publish.' },
      { status: 400 }
    );
  }
  // Only freshly staged workbench blobs may be handed to Instagram — the
  // fetch happens from Meta's side, so stray URLs must never pass through.
  if (!imageUrl.startsWith(`${process.env.NEXT_PUBLIC_BLOB_ROOT ?? 'https://'}`) || !imageUrl.includes('.public.blob.vercel-storage.com')) {
    return NextResponse.json(
      { error: 'The image is not a staged workbench upload.' },
      { status: 400 }
    );
  }
  try {
    await assertStagedBlob(imageUrl);
  } catch {
    return NextResponse.json(
      { error: 'The image could not be verified against staged uploads.' },
      { status: 400 }
    );
  }

  const schedule = parseScheduledPublishTime(body?.scheduledFor);
  if (schedule.error) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  if (schedule.unix !== null) {
    // Instagram has no scheduling API — the workbench is the executor. The
    // staged image sits in scheduled_posts (kind 'instagram-post',
    // source 'local') until the scheduler publishes it at the due time.
    const scheduledForIso = new Date(schedule.unix * 1000).toISOString();
    try {
      const rows = (await sql`
        INSERT INTO scheduled_posts
          (workspace_id, text, image_url, scheduled_for, kind, source, created_by)
        VALUES
          (${workspaceId}, ${caption}, ${imageUrl}, ${scheduledForIso},
           'instagram-post', 'local', ${access.user.id})
        RETURNING id, scheduled_for`) as unknown as {
        id: number;
        scheduled_for: string;
      }[];

      await recordScheduleEvent({
        workspaceId,
        scheduledPostId: rows[0].id,
        event: 'scheduled',
        source: 'composer',
        actorUserId: access.user.id,
        metadata: { kind: 'instagram-post', scheduledFor: scheduledForIso },
      });

      return NextResponse.json(
        {
          id: rows[0].id,
          scheduledFor: scheduledForIso,
          account: {
            id: connection.account.id,
            name: connection.account.username,
          },
        },
        { status: 201 }
      );
    } catch {
      return NextResponse.json(
        { error: 'The post could not be scheduled.' },
        { status: 500 }
      );
    }
  }

  try {
    const result = await publishInstagramImagePost({
      account: connection.account,
      accessToken: connection.accessToken,
      imageUrl,
      caption,
    });

    return NextResponse.json(
      {
        id: result.id,
        permalink: result.permalink,
        account: {
          id: connection.account.id,
          name: connection.account.username,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return instagramErrorResponse(
      error,
      'publish_failed',
      'Instagram rejected the post.',
      { workspaceId, kind: 'instagram-post' }
    );
  }
}
