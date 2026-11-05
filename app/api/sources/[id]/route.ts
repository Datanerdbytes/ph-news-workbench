import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireOwner, unauthorized } from '@/lib/session';
import { ingestFeed } from '@/lib/feeds';
import { randomUUID } from 'crypto';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveFeed(workspaceId: string, params: Promise<{ id: string }>) {
  const { id } = await params;
  const feedId = parseInt(id, 10);
  if (isNaN(feedId)) {
    return {
      error: NextResponse.json({ error: 'Invalid feed ID' }, { status: 400 }),
    } as const;
  }

  const result = await sql`
    SELECT id, workspace_id, url, title, last_fetched_at, error_message, enabled, created_at
    FROM feeds
    WHERE id = ${feedId} AND workspace_id = ${workspaceId}
  `;
  const feed = result[0] ?? null;
  if (!feed) {
    return {
      error: NextResponse.json({ error: 'Feed not found' }, { status: 404 }),
    } as const;
  }

  return { feed } as const;
}

async function itemCount(workspaceId: string, feedId: number) {
  const countResult = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM news_items
    WHERE feed_id = ${feedId} AND workspace_id = ${workspaceId}
  `;
  return countResult[0]?.cnt ?? 0;
}

export async function GET(request: Request, { params }: RouteParams) {
  const access = await requireOwner(request);
  if (!access) return unauthorized();
  if (access instanceof NextResponse) return access;

  try {
    const resolved = await resolveFeed(access.workspace.id, params);
    if ('error' in resolved) return resolved.error;

    return NextResponse.json({
      feed: {
        ...resolved.feed,
        item_count: await itemCount(access.workspace.id, resolved.feed.id),
      },
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error(JSON.stringify({
      route: 'sources',
      event: 'get_error',
      workspaceId: access.workspace.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Failed to fetch source' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const access = await requireOwner(request);
  if (!access) return unauthorized();
  if (access instanceof NextResponse) return access;

  try {
    const resolved = await resolveFeed(access.workspace.id, params);
    if ('error' in resolved) return resolved.error;
    const feed = resolved.feed;

    const body = await request.json();
    const { enabled, title } = body;

    const updates: string[] = [];
    const values: (string | boolean | number)[] = [];

    if (typeof enabled === 'boolean') {
      updates.push(`enabled = $${values.length + 1}`);
      values.push(enabled);
    }
    if (typeof title === 'string' && title.trim()) {
      updates.push(`title = $${values.length + 1}`);
      values.push(title.trim());
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    values.push(feed.id, access.workspace.id);

    const query = `
      UPDATE feeds
      SET ${updates.join(', ')}
      WHERE id = $${values.length - 1} AND workspace_id = $${values.length}
      RETURNING id, workspace_id, url, title, last_fetched_at, error_message, enabled, created_at
    `;

    const result = await sql.query(query, values);
    const updatedFeed = result[0];

    return NextResponse.json({
      feed: {
        ...updatedFeed,
        item_count: await itemCount(access.workspace.id, feed.id),
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      route: 'sources',
      event: 'update_error',
      workspaceId: access.workspace.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Failed to update source' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const access = await requireOwner(request);
  if (!access) return unauthorized();
  if (access instanceof NextResponse) return access;

  try {
    const resolved = await resolveFeed(access.workspace.id, params);
    if ('error' in resolved) return resolved.error;

    // Delete the feed (news_items will keep their data but feed_id will be NULL due to ON DELETE SET NULL)
    await sql`DELETE FROM feeds WHERE id = ${resolved.feed.id} AND workspace_id = ${access.workspace.id}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(JSON.stringify({
      route: 'sources',
      event: 'delete_error',
      workspaceId: access.workspace.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const access = await requireOwner(request);
  if (!access) return unauthorized();
  if (access instanceof NextResponse) return access;

  try {
    const resolved = await resolveFeed(access.workspace.id, params);
    if ('error' in resolved) return resolved.error;
    const feed = resolved.feed;

    if (!feed.enabled) {
      return NextResponse.json({ error: 'Feed is disabled. Enable it first.' }, { status: 400 });
    }

    // Trigger manual ingest
    try {
      const { ingested, skipped } = await ingestFeed(
        { id: feed.id, workspace_id: access.workspace.id, url: feed.url, title: feed.title },
        { correlationId: randomUUID(), trigger: 'manual' },
      );
      return NextResponse.json({ ingested, skipped });
    } catch (error) {
      // ingestFeed already recorded the error on the feed row and logged it
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  } catch (error) {
    console.error(JSON.stringify({
      route: 'sources',
      event: 'ingest_error',
      workspaceId: access.workspace.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Failed to ingest source' }, { status: 500 });
  }
}
