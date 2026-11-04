import {
  FacebookApiError,
  graphPostForm,
  toArrayBuffer,
  type PublishImage,
} from '@/lib/facebook';

export const MAX_STORY_VIDEO_BYTES = 100 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

export type StoryResult = {
  id: string;
  permalink: null;
  kind: 'photo' | 'video';
};

function photoUpload(image: PublishImage): {
  fields: Record<string, string>;
  file?: { bytes: Buffer; type: string; filename: string };
} {
  if ('base64' in image) {
    return {
      fields: {},
      file: {
        bytes: Buffer.from(image.base64, 'base64'),
        type: image.type,
        filename: image.filename,
      },
    };
  }
  return { fields: { url: image.url } };
}

export async function publishPhotoStory({
  pageId,
  accessToken,
  image,
}: {
  pageId: string;
  accessToken: string;
  image: PublishImage;
}): Promise<StoryResult> {
  const upload = photoUpload(image);
  const photo = await graphPostForm<{ id: string }>(
    `${pageId}/photos`,
    { ...upload.fields, published: 'false' },
    accessToken,
    upload.file ? [{ field: 'source', ...upload.file }] : []
  );

  const story = await graphPostForm<{ post_id?: string; id?: string }>(
    `${pageId}/photo_stories`,
    { photo_id: photo.id },
    accessToken
  );

  return { id: story.post_id ?? story.id ?? photo.id, kind: 'photo', permalink: null };
}

export async function publishVideoStory({
  pageId,
  accessToken,
  video,
}: {
  pageId: string;
  accessToken: string;
  video: { bytes: Buffer; type: string; filename: string };
}): Promise<StoryResult> {
  if (video.bytes.length > MAX_STORY_VIDEO_BYTES) {
    throw new Error('Story videos must be 100 MB or smaller.');
  }

  const session = await graphPostForm<{
    video_id?: string;
    upload_url?: string;
  }>(
    `${pageId}/video_stories`,
    { upload_phase: 'start' },
    accessToken
  );

  if (!session.video_id || !session.upload_url) {
    throw new FacebookApiError(
      'Facebook did not return a story upload session.'
    );
  }

  let upload: Response;
  try {
    upload = await fetch(session.upload_url, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        offset: '0',
        file_size: String(video.bytes.length),
        'content-type': 'application/octet-stream',
      },
      body: toArrayBuffer(video.bytes),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch {
    throw new FacebookApiError('The story video upload to Facebook failed.');
  }

  if (!upload.ok) {
    const body = (await upload.json().catch(() => null)) as {
      error?: { message?: string; code?: number };
    } | null;
    throw new FacebookApiError(
      body?.error?.message ??
        `Facebook rejected the story upload (${upload.status}).`,
      body?.error?.code
    );
  }

  const finish = await graphPostForm<{ post_id?: string; id?: string }>(
    `${pageId}/video_stories`,
    {
      upload_phase: 'finish',
      video_id: session.video_id,
      video_state: 'PUBLISHED',
    },
    accessToken
  );

  return {
    id: finish.post_id ?? finish.id ?? session.video_id,
    kind: 'video',
    permalink: null,
  };
}
