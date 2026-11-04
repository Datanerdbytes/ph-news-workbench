import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  const rows = await sql`
    SELECT d.id, d.news_item_id, d.status, d.error_message, d.correlation_id, d.created_at,
           n.title AS news_title
    FROM drafts d
    LEFT JOIN news_items n ON n.id = d.news_item_id
    WHERE d.workspace_id = ${access.workspace.id}
    ORDER BY d.id DESC
    LIMIT 100`;
  return NextResponse.json(rows);
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

  return NextResponse.json({ deleted: rows.length });
}
