import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  probeVideoDurationSeconds,
  transcodeToReelFootage,
} from '@/lib/hyperframes/media';
import { localRuntimeEnabled } from '@/lib/hyperframes/project';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_DURATION = 3;
const MAX_DURATION = 90;
const MAX_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

/**
 * Normalize an uploaded reel to H.264/AAC 1080×1920 before preview or
 * publishing. Browsers without AV1/HEVC support (Safari) cannot even preview
 * such files, and Facebook prefers standard encodings, so the Reels page runs
 * every picked video through here first.
 */
export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  if (!localRuntimeEnabled()) {
    return NextResponse.json(
      {
        error:
          'Video normalization runs locally only. The original video will be used.',
      },
      { status: 503 }
    );
  }

  const form = await request.formData().catch(() => null);
  const video = form?.get('video');
  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json({ error: 'Choose an MP4 or MOV video.' }, { status: 400 });
  }
  const looksLikeVideo =
    VIDEO_TYPES.has(video.type) || (!video.type && /\.(mp4|mov)$/i.test(video.name));
  if (!looksLikeVideo) {
    return NextResponse.json({ error: 'Upload an MP4 or MOV video.' }, { status: 400 });
  }
  if (video.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Videos must be 100 MB or smaller.' },
      { status: 400 }
    );
  }

  let workDir: string | null = null;
  try {
    workDir = await mkdtemp(path.join(tmpdir(), 'reel-prepare-'));
    const inputPath = path.join(workDir, 'input.mp4');
    const outputPath = path.join(workDir, 'output.mp4');
    await writeFile(inputPath, Buffer.from(await video.arrayBuffer()));

    const duration = await probeVideoDurationSeconds(inputPath);
    if (duration === null) {
      return NextResponse.json(
        { error: 'Could not read the video. Is it a valid video file?' },
        { status: 400 }
      );
    }
    if (duration < MIN_DURATION || duration > MAX_DURATION) {
      return NextResponse.json(
        {
          error: `Facebook reels must be ${MIN_DURATION}–${MAX_DURATION} seconds (this one is ${duration.toFixed(1)}s).`,
        },
        { status: 400 }
      );
    }

    await transcodeToReelFootage(inputPath, outputPath);
    const buffer = await readFile(outputPath);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(buffer.length),
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The video could not be normalized.',
      },
      { status: 500 }
    );
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}
