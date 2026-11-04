import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const renderId = Number(id);
  if (!Number.isInteger(renderId) || renderId <= 0) {
    return NextResponse.json({ error: 'Render not found.' }, { status: 404 });
  }

  try {
    const rows = (await sql`
      SELECT status, error, log_tail
      FROM hyperframes_renders
      WHERE id = ${renderId}
        AND workspace_id = ${access.workspace.id}
    `) as unknown as {
      status: string;
      error: string | null;
      log_tail: string | null;
    }[];

    if (!rows[0]) {
      return NextResponse.json({ error: 'Render not found.' }, { status: 404 });
    }

    return NextResponse.json(
      {
        status: rows[0].status,
        error: rows[0].error,
        logTail: rows[0].log_tail,
      },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    console.error('Could not read HyperFrames render status:', error);
    return NextResponse.json(
      { error: 'Could not read render status.' },
      { status: 500 }
    );
  }
}
