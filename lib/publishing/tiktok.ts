import { assertStagedBlob } from '@/lib/blob';
import { initTikTokVideoPost, TikTokMetadata } from '@/lib/tiktok';

export type TikTokPublishResult = {
  id: string;
  /**
   * TikTok does not hand back a web link at init time — the video is still
   * processing. The composer surfaces the publish id; permalinks come last.
   */
  permalink: string | null;
};

/** Blob staging caps uploads at 1 GB — asserted through a HEAD, no buffer. */
export const TIKTOK_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;

async function stagedVideoSize(url: string): Promise<number | null> {
  const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  if (!response.ok) return null;
  const length = response.headers.get('content-length');
  const size = length ? Number(length) : NaN;
  return Number.isFinite(size) ? size : null;
}

/**
 * End-to-end video publish: staged blob → PULL_FROM_URL init → publish id.
 * TikTok fetches the bytes from the (public) staging URL itself, so the
 * workbench never buffers a 300 MB file just to hand it over again.
 */
export async function publishTikTokVideo({
  accessToken,
  metadata,
  videoUrl,
}: {
  accessToken: string;
  metadata: TikTokMetadata;
  videoUrl: string;
}): Promise<TikTokPublishResult> {
  await assertStagedBlob(videoUrl);
  const size = await stagedVideoSize(videoUrl);
  if (size === null) {
    throw new Error('The staged video could not be read.');
  }
  if (size === 0) {
    throw new Error('The staged video file is empty.');
  }
  if (size > TIKTOK_UPLOAD_MAX_BYTES) {
    throw new Error(
      'The video is larger than the 1 GB staging cap. Trim the file and retry.'
    );
  }
  const { publishId } = await initTikTokVideoPost({
    accessToken,
    metadata,
    videoUrl,
  });
  return { id: publishId, permalink: null };
}
