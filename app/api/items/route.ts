import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  const rows = await sql`
    SELECT n.id, n.title, n.summary, n.link, n.created_at,
           (SELECT d.id FROM drafts d
             WHERE d.news_item_id = n.id AND d.workspace_id = ${access.workspace.id}
             ORDER BY d.id DESC LIMIT 1) AS draft_id,
           CASE
             WHEN EXISTS (SELECT 1 FROM drafts d
               WHERE d.news_item_id = n.id AND d.workspace_id = ${access.workspace.id} AND d.status = 'published')
               THEN 'published'
             WHEN EXISTS (SELECT 1 FROM drafts d
               WHERE d.news_item_id = n.id AND d.workspace_id = ${access.workspace.id})
               THEN 'drafted'
             ELSE 'pending'
           END AS status
    FROM news_items n
    ORDER BY n.id DESC
    LIMIT 50`;
  return NextResponse.json(rows);
}