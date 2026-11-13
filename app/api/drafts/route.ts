import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  const params = new URL(request.url).searchParams;
  const before = Number(params.get('before'));
  const requestedLimit = Number(params.get('limit'));
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 200)
      : 100;
  // One extra row decides hasMore without a separate count query.
  const rows =
    before > 0
      ? await sql`
    SELECT d.id, d.news_item_id, d.status, d.error_message, d.correlation_id, d.created_at,
           n.title AS news_title
    FROM drafts d
    LEFT JOIN news_items n ON n.id = d.news_item_id
    WHERE d.workspace_id = ${access.workspace.id} AND d.id < ${before}
    ORDER BY d.id DESC
    LIMIT ${limit + 1}`
      : await sql`
    SELECT d.id, d.news_item_id, d.status, d.error_message, d.correlation_id, d.created_at,
           n.title AS news_title
    FROM drafts d
    LEFT JOIN news_items n ON n.id = d.news_item_id
    WHERE d.workspace_id = ${access.workspace.id}
    ORDER BY d.id DESC
    LIMIT ${limit + 1}`;
  const hasMore = rows.length > limit;
  const drafts = rows.slice(0, limit);
  return NextResponse.json({
    drafts,
    nextCursor: hasMore ? (drafts.at(-1)?.id ?? null) : null,
    hasMore,
  });
}

export async function DELETE(req: Request) {
  const access = await requireWorkspace(req);
  if (!access) return unauthorized();
  const newsItemId = Number(new URL(req.url).searchParams.get('newsItemId'));
  if (!Number.isInteger(newsItemId) || newsItemId <= 0) {
    return NextResponse.json({ error: 'newsItemId is required' }, { status: 400 });
  }

  const rows = await sql`
    DELETE FROM drafts
    WHERE news_item_id = ${newsItemId} AND workspace_id = ${access.workspace.id}
    RETURNING id`;
  if (!rows.length) {
    return NextResponse.json({ error: 'No draft found for this story.' }, { status: 404 });
  }

  // The story goes back to the queue only if nothing else marks it as having
  // a draft (e.g. a second drafted copy) or a published post.
  const item = await sql`
    UPDATE news_items
    SET status = 'pending'
    WHERE id = ${newsItemId}
      AND status = 'drafted'
      AND NOT EXISTS (
        SELECT 1 FROM drafts
        WHERE news_item_id = ${newsItemId} AND workspace_id = ${access.workspace.id}
      )
    RETURNING id`;

  return NextResponse.json({ deleted: rows.length, reset: item.length });
}
