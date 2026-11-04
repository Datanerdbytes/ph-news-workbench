import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensurePreviewServer } from '@/lib/hyperframes/preview';
import { localRuntimeEnabled } from '@/lib/hyperframes/project';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  if (!localRuntimeEnabled()) {
    return NextResponse.json(
      { error: 'HyperFrames preview is available only in the local runtime.' },
      { status: 503 }
    );
  }

  const { id } = await params;
  const compositionId = Number(id);
  if (!Number.isInteger(compositionId) || compositionId <= 0) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
  }

  try {
    const rows = (await sql`
      SELECT html
      FROM hyperframes_compositions
      WHERE id = ${compositionId}
        AND workspace_id = ${access.workspace.id}
    `) as unknown as { html: string }[];
    if (!rows[0]) {
      return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
    }

    const url = await ensurePreviewServer(compositionId, rows[0].html);
    return NextResponse.json({ url }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Could not start HyperFrames preview:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not start the HyperFrames preview.',
      },
      { status: 502 }
    );
  }
}
