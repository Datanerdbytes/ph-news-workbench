import { NextResponse } from 'next/server';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import { listPageAlbums } from '@/lib/publishing/photos';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await requirePublishingConnection(request, 'load albums');
  if (result.response) return result.response;

  try {
    const albums = await listPageAlbums(
      result.context.connection.pageId,
      result.context.connection.accessToken
    );
    return NextResponse.json({ albums }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return facebookErrorResponse(
      error,
      'albums_failed',
      'Could not load the Page albums.'
    );
  }
}
