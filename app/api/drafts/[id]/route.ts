import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  const { id } = await params;
  const rows = await sql`SELECT id, news_item_id, text, model, input_tokens, output_tokens, estimated_cost, status, correlation_id, error_message, created_at FROM drafts WHERE id = ${id} AND workspace_id = ${access.workspace.id}`;
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  const { id } = await params;
  const rows = await sql`
    DELETE FROM drafts
    WHERE id = ${id} AND workspace_id = ${access.workspace.id}
    RETURNING news_item_id`;
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ deleted: true, newsItemId: rows[0].news_item_id });
}