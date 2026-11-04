import {
  FacebookApiError,
  graphPostForm,
  graphRequest,
  type GraphUploadFile,
} from '@/lib/facebook';
import { scheduledFields } from './schedule';

export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 3 * 60_000;

type StartResponse = {
  upload_session_id?: string;
  video_id?: string;
  start_offset?: string | number;
  end_offset?: string | number;
};

export type VideoUpload = {
  bytes: Buffer;
  type: string;
  filename: string;
};

export type PageVideo = {
  id: string;
  permalink: string | null;
};

export async function publishPageVideo({
  pageId,
  accessToken,
  title,
  description = '',
  video,
  thumbnail = null,
  feedTargeting = '',
  scheduledPublishTime = null,
}: {
  pageId: string;
  accessToken: string;
  title: string;
  description?: string;
  video: VideoUpload;
  thumbnail?: VideoUpload | null;
  feedTargeting?: string;
  scheduledPublishTime?: number | null;
}): Promise<PageVideo> {
  if (video.bytes.length > MAX_VIDEO_BYTES) {
    throw new Error(
      'Videos must be 1 GB or smaller for the chunked uploader.'
    );
  }

  const session = await graphPostForm<StartResponse>(
    `${pageId}/videos`,
    {
      upload_phase: 'start',
      file_size: String(video.bytes.length),
    },
    accessToken
  );

  if (!session.upload_session_id || !session.video_id) {
    throw new FacebookApiError(
      'Facebook did not return a video upload session.'
    );
  }

  const sessionId = session.upload_session_id;

  for (let offset = 0; offset < video.bytes.length; offset += CHUNK_BYTES) {
    const end = Math.min(offset + CHUNK_BYTES, video.bytes.length);
    const chunk: GraphUploadFile = {
      field: 'video_file_chunk',
      bytes: video.bytes.subarray(offset, end),
      type: 'application/octet-stream',
      filename: 'chunk',
    };

    await graphPostForm(
      `${pageId}/videos`,
      {
        upload_phase: 'transfer',
        upload_session_id: sessionId,
        start_offset: String(offset),
      },
      accessToken,
      [chunk],
      CHUNK_TIMEOUT_MS
    );
  }

  const finishFields: Record<string, string> = {
    upload_phase: 'finish',
    upload_session_id: sessionId,
    title,
    ...scheduledFields(scheduledPublishTime),
  };
  if (description) finishFields.description = description;
  if (feedTargeting) finishFields.feed_targeting = feedTargeting;

  await graphPostForm(
    `${pageId}/videos`,
    finishFields,
    accessToken,
    thumbnail ? [{ field: 'thumb', ...thumbnail }] : [],
    CHUNK_TIMEOUT_MS
  );

  let permalink: string | null = null;
  try {
    const body = await graphRequest<{ permalink_url?: string }>(
      session.video_id,
      { fields: 'permalink_url' },
      accessToken
    );
    permalink = body.permalink_url ?? null;
  } catch {
    // Facebook processes the video asynchronously; the post still exists.
  }

  return { id: session.video_id, permalink };
}
