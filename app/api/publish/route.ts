import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { resolvePageTargets } from '@/lib/publishing/connection';
import { stripMarkdown } from '@/lib/format';
import {
  FacebookApiError,
  parseImages,
  publishPagePost,
  redactTokens,
} from '@/lib/facebook';

export const dynamic = 'force-dynamic';

type ConnectionRow = {
  scopes: string | null;
};

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const connectionRows = (await sql`
    SELECT scopes
    FROM facebook_connections
    WHERE workspace_id = ${access.workspace.id}
  `) as unknown as ConnectionRow[];

  const connection = connectionRows[0];
  if (!connection) {
    return NextResponse.json(
      { error: 'Connect your Facebook Page before publishing.', code: 'not_connected' },
      { status: 409 }
    );
  }

  const scopes = (connection.scopes ?? '').split(',').filter(Boolean);
  if (!scopes.includes('pages_manage_posts')) {
    return NextResponse.json(
      {
        error:
          'This connection cannot publish. Reconnect the Page to grant pages_manage_posts.',
        code: 'scope_missing',
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const message =
    typeof body?.message === 'string' ? stripMarkdown(body.message) : '';
  if (!message) {
    return NextResponse.json(
      { error: 'Write or generate a draft before publishing.' },
      { status: 400 }
    );
  }

  const newsItemId = Number(body?.newsItemId);
  if (!Number.isInteger(newsItemId) || newsItemId <= 0) {
    return NextResponse.json({ error: 'newsItemId is required.' }, { status: 400 });
  }

  // Optional target page — falls back to the workspace default (primary)
  // page, then to the legacy connection, matching every other composer.
  const requestedPageId =
    typeof body?.pageId === 'string' && body.pageId ? body.pageId : null;
  const targets = await resolvePageTargets(
    access.workspace.id,
    requestedPageId ? [requestedPageId] : []
  );
  const target = targets[0];
  if (!target) {
    return NextResponse.json(
      {
        error: requestedPageId
          ? 'That Page is not connected to this workspace.'
          : 'Connect your Facebook Page before publishing.',
        code: 'not_connected',
      },
      { status: 409 }
    );
  }

  try {
    const imageUrls = Array.isArray(body?.imageUrls)
      ? body.imageUrls
      : typeof body?.imageUrl === 'string'
        ? [body.imageUrl]
        : [];
    const post = await publishPagePost({
      pageId: target.id,
      accessToken: target.accessToken,
      message,
      images: parseImages(imageUrls),
    });

    await sql`
      UPDATE drafts SET status = 'published'
      WHERE id = (
        SELECT id FROM drafts
        WHERE news_item_id = ${newsItemId} AND workspace_id = ${access.workspace.id}
        ORDER BY id DESC LIMIT 1
      )`;

    return NextResponse.json({
      id: post.id,
      permalink: post.permalink,
      page: { id: target.id, name: target.name },
    });
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
        { error: redactTokens(error.message), code: 'publish_failed' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'The post could not be published.', code: 'publish_failed' },
      { status: 500 }
    );
  }
}
