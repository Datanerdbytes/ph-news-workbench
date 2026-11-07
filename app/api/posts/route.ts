import { NextResponse } from 'next/server';
import { stripMarkdown } from '@/lib/format';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import {
  crosspostResponse,
  publishToSelectedPages,
} from '@/lib/publishing/crosspost';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import { publishTextPost } from '@/lib/publishing/posts';
import { readPageIds, readText } from '@/lib/publishing/request';
import { parseScheduledPublishTime } from '@/lib/publishing/schedule';
import { recordNativeSchedule } from '@/lib/schedule-mirror';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LENGTH = 5000;

export async function POST(request: Request) {
  const result = await requirePublishingConnection(request, 'publish a post');
  if (result.response) return result.response;

  const { access } = result.context;
  const body = await request.json().catch(() => null);

  const message = stripMarkdown(
    typeof body?.message === 'string' ? body.message : ''
  ).slice(0, MAX_MESSAGE_LENGTH);
  if (!message) {
    return NextResponse.json(
      { error: 'Write a message before posting.' },
      { status: 400 }
    );
  }

  let link = '';
  if (typeof body?.link === 'string' && body.link.trim()) {
    const candidate = body.link.trim();
    if (!/^https?:\/\//i.test(candidate)) {
      return NextResponse.json(
        { error: 'Links must start with http:// or https://.' },
        { status: 400 }
      );
    }
    link = candidate;
  }

  const schedule = parseScheduledPublishTime(body?.scheduledFor);
  if (schedule.error) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }

  const pageIds = readPageIds(body?.pageIds);

  try {
    const { results } = await publishToSelectedPages({
      workspaceId: access.workspace.id,
      pageIds,
      publish: (page) =>
        publishTextPost({
          pageId: page.id,
          accessToken: page.accessToken,
          message,
          link,
          scheduledPublishTime: schedule.unix,
        }),
    });

    await recordNativeSchedule({
      workspaceId: access.workspace.id,
      userId: access.user.id,
      kind: 'post',
      text: message,
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
        kind: 'post',
      }
    );
  } catch (error) {
    return facebookErrorResponse(
      error,
      'post_failed',
      'The post could not be published.'
    );
  }
}
