import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { projectDir, workbenchRoot } from '@/lib/hyperframes/project';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' && !path.isAbsolute(relative);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const renderId = Number(id);
  if (!Number.isInteger(renderId) || renderId <= 0) {
    return NextResponse.json({ error: 'Rendered video not found.' }, { status: 404 });
  }

  try {
    const rows = (await sql`
      SELECT composition_id, status, mp4_path
      FROM hyperframes_renders
      WHERE id = ${renderId}
        AND workspace_id = ${access.workspace.id}
    `) as unknown as {
      composition_id: number;
      status: string;
      mp4_path: string | null;
    }[];
    const render = rows[0];
    if (!render || render.status !== 'done' || !render.mp4_path) {
      return NextResponse.json({ error: 'Rendered video not found.' }, { status: 404 });
    }

    const root = await realpath(workbenchRoot());
    const expectedProject = await realpath(projectDir(render.composition_id));
    const filePath = await realpath(render.mp4_path);
    if (
      !isWithin(root, expectedProject) ||
      !isWithin(expectedProject, filePath) ||
      path.extname(filePath).toLowerCase() !== '.mp4'
    ) {
      return NextResponse.json({ error: 'Rendered video not found.' }, { status: 404 });
    }

    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) {
      return NextResponse.json({ error: 'Rendered video not found.' }, { status: 404 });
    }

    const file = createReadStream(filePath);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        file.on('data', (chunk) => {
          if (cancelled) return;
          controller.enqueue(
            typeof chunk === 'string' ? Buffer.from(chunk) : chunk
          );
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            file.pause();
          }
        });
        file.once('end', () => {
          if (!cancelled) controller.close();
        });
        file.once('error', (error) => {
          if (!cancelled) controller.error(error);
        });
      },
      pull() {
        file.resume();
      },
      cancel() {
        cancelled = true;
        file.destroy();
      },
    });

    return new NextResponse(body, {
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(info.size),
        'content-disposition': 'attachment; filename="reel.mp4"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Rendered video not found.' }, { status: 404 });
    }
    console.error('Could not stream HyperFrames render:', error);
    return NextResponse.json(
      { error: 'Could not read rendered video.' },
      { status: 500 }
    );
  }
}
