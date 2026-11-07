import { NextResponse } from 'next/server';
import type { PublishImage } from '@/lib/facebook';
import { requirePublishingConnection } from '@/lib/publishing/connection';
import {
  crosspostResponse,
  publishToSelectedPages,
} from '@/lib/publishing/crosspost';
import { facebookErrorResponse } from '@/lib/publishing/errors';
import { readPageIds } from '@/lib/publishing/request';
import {
  MAX_STORY_VIDEO_BYTES,
  publishPhotoStory,
  publishVideoStory,
} from '@/lib/publishing/stories';

export const dynamic = 'force-dynamic';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const result = await requirePublishingConnection(request, 'publish stories');
  if (result.response) return result.response;

  const { access } = result.context;
  const form = await request.formData().catch(() => null);
  const kind = form?.get('kind');
  if (kind !== 'photo' && kind !== 'video') {
    return NextResponse.json(
      { error: 'Choose a photo or video story.' },
      { status: 400 }
    );
  }

  const pageIds = readPageIds(form?.get('pageIds'));

  try {
    if (kind === 'photo') {
      const file = form?.get('photo');
      const url = form?.get('photoUrl');
      let image: PublishImage | null = null;

      if (file instanceof File && file.size > 0) {
        if (!IMAGE_TYPES.has(file.type)) {
          return NextResponse.json(
            { error: 'Photo stories must be JPEG, PNG, or WebP.' },
            { status: 400 }
          );
        }
        if (file.size > MAX_IMAGE_BYTES) {
          return NextResponse.json(
            { error: 'Photo stories must be 20 MB or smaller.' },
            { status: 400 }
          );
        }
        const extension =
          file.type === 'image/jpeg'
            ? 'jpg'
            : file.type === 'image/webp'
              ? 'webp'
              : 'png';
        image = {
          base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
          type: file.type,
          filename: `story.${extension}`,
        };
      } else if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
        image = { url: url.trim() };
      }

      if (!image) {
        return NextResponse.json(
          { error: 'Choose a photo or paste a public image URL.' },
          { status: 400 }
        );
      }

      const { results } = await publishToSelectedPages({
        workspaceId: access.workspace.id,
        pageIds,
        publish: (page) =>
          publishPhotoStory({
            pageId: page.id,
            accessToken: page.accessToken,
            image,
          }),
      });

      return crosspostResponse(results, { kind }, {
      workspaceId: access.workspace.id,
      actorUserId: access.user.id,
      kind,
    });
    }

    const video = form?.get('video');
    if (!(video instanceof File) || video.size === 0) {
      return NextResponse.json(
        { error: 'Choose an MP4 or MOV video for the story.' },
        { status: 400 }
      );
    }
    const looksLikeVideo =
      VIDEO_TYPES.has(video.type) ||
      (!video.type && /\.(mp4|mov)$/i.test(video.name));
    if (!looksLikeVideo) {
      return NextResponse.json(
        { error: 'Upload an MP4 or MOV video.' },
        { status: 400 }
      );
    }
    if (video.size > MAX_STORY_VIDEO_BYTES) {
      return NextResponse.json(
        { error: 'Story videos must be 100 MB or smaller.' },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await video.arrayBuffer());
    const { results } = await publishToSelectedPages({
      workspaceId: access.workspace.id,
      pageIds,
      publish: (page) =>
        publishVideoStory({
          pageId: page.id,
          accessToken: page.accessToken,
          video: {
            bytes,
            type: video.type || 'video/mp4',
            filename: video.name || 'story.mp4',
          },
        }),
    });

    return crosspostResponse(results, { kind }, {
      workspaceId: access.workspace.id,
      actorUserId: access.user.id,
      kind,
    });
  } catch (error) {
    return facebookErrorResponse(
      error,
      'story_failed',
      'The story could not be published.'
    );
  }
}
