import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/session';
import { assertStagedBlob, deleteStagedBlobs } from '@/lib/blob';

export const runtime = 'nodejs';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Mints short-lived client upload tokens so the browser can push media
 * straight to Vercel Blob — sidestepping the 4.5 MB serverless request-body
 * limit. Only signed-in users get tokens, and they only allow our media
 * types and sizes.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const isVideo = /\.(mp4|mov)$/i.test(pathname);
        return {
          allowedContentTypes: isVideo ? VIDEO_TYPES : IMAGE_TYPES,
          maximumSizeInBytes: isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'The upload was rejected.',
      },
      { status: 400 }
    );
  }
}

/** Removes a staged file once it has served its purpose (or was abandoned). */
export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await requireUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as
    | { url?: unknown }
    | null;
  const url = typeof body?.url === 'string' ? body.url : '';
  if (!url) {
    return NextResponse.json({ error: 'Pass the blob url.' }, { status: 400 });
  }

  try {
    await assertStagedBlob(url);
  } catch {
    return NextResponse.json(
      { error: 'Unknown staged file.' },
      { status: 404 }
    );
  }

  await deleteStagedBlobs([url]);
  return NextResponse.json({ ok: true });
}
