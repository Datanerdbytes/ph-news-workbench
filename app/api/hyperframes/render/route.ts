import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { localRuntimeEnabled } from '@/lib/hyperframes/project';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QUALITIES = new Set(['draft', 'looks', 'delivery']);

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  if (!localRuntimeEnabled()) {
    return NextResponse.json(
      { error: 'HyperFrames rendering is available only in the local runtime.' },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    compositionId?: unknown;
    quality?: unknown;
  } | null;
  const compositionId =
    typeof body?.compositionId === 'number' ? body.compositionId : NaN;
  const quality = typeof body?.quality === 'string' ? body.quality : '';
  if (!Number.isInteger(compositionId) || compositionId <= 0) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 400 });
  }
  if (!QUALITIES.has(quality)) {
    return NextResponse.json(
      { error: 'Choose draft, looks, or delivery render quality.' },
      { status: 400 }
    );
  }

  try {
    const compositions = await sql`
      SELECT id
      FROM hyperframes_compositions
      WHERE id = ${compositionId}
        AND workspace_id = ${access.workspace.id}
    `;
    if (!compositions[0]) {
      return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
    }

    const rows = (await sql`
      INSERT INTO hyperframes_renders
        (workspace_id, composition_id, status, quality, created_by)
      VALUES
        (${access.workspace.id}, ${compositionId}, 'queued', ${quality}, ${access.user.id})
      RETURNING id
    `) as unknown as { id: number }[];
    const renderId = rows[0]?.id;
    if (!renderId) {
      throw new Error('The render job could not be queued.');
    }

    const script = path.join(process.cwd(), 'scripts', 'hyperframes-render.mjs');
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [script, String(renderId)], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
        env: {
          PATH: process.env.PATH,
          PATHEXT: process.env.PATHEXT,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          TMP: process.env.TMP,
          TEMP: process.env.TEMP,
          DATABASE_URL: process.env.DATABASE_URL,
          NODE_ENV: process.env.NODE_ENV,
          HYPERFRAMES_ENABLE_RENDER: process.env.HYPERFRAMES_ENABLE_RENDER,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not start the render process.';
      await sql`
        UPDATE hyperframes_renders
        SET status = 'failed', error = 'Could not start the local render process.',
            log_tail = ${message.slice(-8000)}, updated_at = now()
        WHERE id = ${renderId}
          AND workspace_id = ${access.workspace.id}
      `;
      throw error;
    }
    child.once('error', (error) => {
      console.error(`Could not spawn HyperFrames render ${renderId}:`, error);
      void sql`
        UPDATE hyperframes_renders
        SET status = 'failed', error = 'Could not start the local render process.',
            log_tail = ${error.message.slice(-8000)}, updated_at = now()
        WHERE id = ${renderId}
          AND workspace_id = ${access.workspace.id}
          AND status IN ('queued', 'rendering')
      `.catch((updateError) => {
        console.error(`Could not mark render ${renderId} as failed:`, updateError);
      });
    });
    child.once('close', (code, signal) => {
      if (code === 0) return;
      const message = `The render process exited with ${code ?? signal}.`;
      void sql`
        UPDATE hyperframes_renders
        SET status = 'failed', error = ${message}, log_tail = ${message},
            updated_at = now()
        WHERE id = ${renderId}
          AND workspace_id = ${access.workspace.id}
          AND status IN ('queued', 'rendering')
      `.catch((updateError) => {
        console.error(`Could not record render process exit ${renderId}:`, updateError);
      });
    });
    child.unref();

    return NextResponse.json({ renderId }, { status: 202 });
  } catch (error) {
    console.error('Could not queue HyperFrames render:', error);
    return NextResponse.json(
      { error: 'The render job could not be queued.' },
      { status: 500 }
    );
  }
}
