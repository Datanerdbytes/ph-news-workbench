import { NextResponse } from 'next/server';
import { MAX_POST_IMAGES, parseImages } from '@/lib/facebook';
import { stripMarkdown } from '@/lib/format';
import { deleteStagedBlobs } from '@/lib/blob';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import {
  crosspostResponse,
  publishToSelectedPages,
} from '@/lib/publishing/crosspost';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import {
  addPhotosToAlbum,
  createPageAlbum,
  publishPhotoPost,
} from '@/lib/publishing/photos';
import { readPageIds } from '@/lib/publishing/request';
import { parseScheduledPublishTime } from '@/lib/publishing/schedule';
import { recordNativeSchedule } from '@/lib/schedule-mirror';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const result = await requirePublishingConnection(request, 'publish photos');
  if (result.response) return result.response;

  const { access, connection } = result.context;
  const body = await request.json().catch(() => null);
  const mode = typeof body?.mode === 'string' ? body.mode : 'post';
  const message = stripMarkdown(
    typeof body?.message === 'string' ? body.message : ''
  );
  const rawImages = Array.isArray(body?.images) ? body.images : [];
  const images = parseImages(rawImages);
  // Staged images live in Blob only until Facebook fetches them — drop the
  // staging copies once the publish succeeds so nothing lingers.
  const stagedBlobUrls = images
    .map((image) => ('url' in image ? image.url : null))
    .filter(
      (url): url is string =>
        url !== null && url.includes('.public.blob.vercel-storage.com')
    );
  const pageIds = readPageIds(body?.pageIds);

  try {
    if (mode === 'album-create') {
      const name =
        typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
      if (!name) {
        return NextResponse.json(
          { error: 'Give the album a name.' },
          { status: 400 }
        );
      }

      const album = await createPageAlbum({
        pageId: connection.pageId,
        accessToken: connection.accessToken,
        name,
        description: message,
      });

      return NextResponse.json(
        {
          ...album,
          page: { id: connection.pageId, name: connection.pageName },
        },
        { status: 201 }
      );
    }

    if (mode === 'album-add') {
      const albumId =
        typeof body?.albumId === 'string' ? body.albumId.trim() : '';
      if (!albumId) {
        return NextResponse.json(
          { error: 'Choose an album to add photos to.' },
          { status: 400 }
        );
      }
      if (!images.length) {
        return NextResponse.json(
          { error: 'Choose at least one image.' },
          { status: 400 }
        );
      }

      const added = await addPhotosToAlbum({
        pageId: connection.pageId,
        accessToken: connection.accessToken,
        albumId,
        message,
        images,
      });

      await deleteStagedBlobs(stagedBlobUrls);

      return NextResponse.json(
        {
          ...added,
          page: { id: connection.pageId, name: connection.pageName },
        },
        { status: 201 }
      );
    }

    if (mode !== 'post' && mode !== 'single') {
      return NextResponse.json(
        { error: 'Unknown photo publishing mode.' },
        { status: 400 }
      );
    }

    if (!images.length) {
      return NextResponse.json(
        { error: 'Choose at least one image.' },
        { status: 400 }
      );
    }
    if (rawImages.length > MAX_POST_IMAGES) {
      return NextResponse.json(
        { error: `You can attach up to ${MAX_POST_IMAGES} images.` },
        { status: 400 }
      );
    }

    const schedule = parseScheduledPublishTime(body?.scheduledFor);
    if (schedule.error) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }

    const { results } = await publishToSelectedPages({
      workspaceId: access.workspace.id,
      pageIds,
      publish: (page) =>
        publishPhotoPost({
          pageId: page.id,
          accessToken: page.accessToken,
          message,
          images,
          scheduledPublishTime: schedule.unix,
        }),
    });

    await recordNativeSchedule({
      workspaceId: access.workspace.id,
      userId: access.user.id,
      kind: 'photo',
      text: message,
      scheduledFor: schedule.unix ? new Date(schedule.unix * 1000) : null,
      results,
    });

    await deleteStagedBlobs(stagedBlobUrls);

    return crosspostResponse(
      results,
      {
        mode,
        scheduledFor: schedule.unix
          ? new Date(schedule.unix * 1000).toISOString()
          : null,
      },
      {
        workspaceId: access.workspace.id,
        actorUserId: access.user.id,
        kind: 'photo',
      }
    );
  } catch (error) {
    return facebookErrorResponse(
      error,
      'photo_failed',
      'The photos could not be published.'
    );
  }
}
