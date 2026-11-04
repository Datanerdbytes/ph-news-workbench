import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { stopPreviewServer } from '@/lib/hyperframes/preview';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const compositionId = Number(id);
  if (!Number.isInteger(compositionId) || compositionId <= 0) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
  }

  const rows = (await sql`
    SELECT id, brief, html, provider, model, created_at
    FROM hyperframes_compositions
    WHERE id = ${compositionId}
      AND workspace_id = ${access.workspace.id}
  `) as unknown as {
    id: number;
    brief: string;
    html: string;
    provider: string;
    model: string;
    created_at: string;
  }[];

  if (!rows[0]) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
  }

  return NextResponse.json(
    { composition: rows[0] },
    { headers: { 'cache-control': 'no-store' } }
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const compositionId = Number(id);
  if (!Number.isInteger(compositionId) || compositionId <= 0) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
  }

  const rows = await sql`
    DELETE FROM hyperframes_compositions
    WHERE id = ${compositionId}
      AND workspace_id = ${access.workspace.id}
    RETURNING id`;
  if (!rows[0]) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
  }
  await stopPreviewServer(compositionId);

  return NextResponse.json({ deleted: true });
}
