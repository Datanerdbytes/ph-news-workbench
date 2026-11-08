import { assertStagedBlob, stagedFileToBuffer } from '@/lib/blob';
import {
  createYouTubeUploadSession,
  uploadYouTubeBytes,
  YouTubeMetadata,
} from '@/lib/youtube';

export type YouTubePublishResult = {
  id: string;
  permalink: string;
};

/** Blob staging caps uploads at 1 GB — held until YouTube streaming lands. */
const YOUTUBE_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;

function contentTypeForUrl(url: string): string {
  return /\.mov(\?|$)/i.test(url) ? 'video/quicktime' : 'video/mp4';
}

/**
 * End-to-end video publish: staged blob → resumable upload session →
 * bytes → video id. Processing on YouTube's side is async; processing
 * state lives in YouTube's studio, not our queue.
 */
export async function publishYouTubeVideo({
  accessToken,
  metadata,
  videoUrl,
}: {
  accessToken: string;
  metadata: YouTubeMetadata;
  videoUrl: string;
}): Promise<YouTubePublishResult> {
  await assertStagedBlob(videoUrl);
  const bytes = await stagedFileToBuffer(videoUrl);
  if (bytes.length === 0) {
    throw new Error('The staged video file is empty.');
  }
  if (bytes.length > YOUTUBE_UPLOAD_MAX_BYTES) {
    throw new Error(
      'The video is larger than the 1 GB staging cap. Trim the file and retry.'
    );
  }
  const contentType = contentTypeForUrl(videoUrl);
  const location = await createYouTubeUploadSession({
    accessToken,
    sizeBytes: bytes.length,
    contentType,
    metadata,
  });
  const id = await uploadYouTubeBytes(location, bytes, contentType);
  return {
    id,
    permalink: `https://www.youtube.com/watch?v=${id}`,
  };
}
