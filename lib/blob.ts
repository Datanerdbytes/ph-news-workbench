import { del, head } from '@vercel/blob';

/**
 * Verify a staged URL belongs to our Blob store before fetching or deleting
 * it — `head()` authenticates against the store, so a fabricated or foreign
 * URL is refused here and never trusted from the client alone.
 */
export async function assertStagedBlob(url: string): Promise<void> {
  await head(url);
}

/**
 * Download a staged file into memory. Used by publishing routes on Vercel,
 * where inbound request bodies cap at 4.5 MB: the browser stages the file to
 * Blob directly (client → storage, no function in between) and the route
 * reads it from there — outbound requests have no such limit.
 */
export async function stagedFileToBuffer(url: string): Promise<Buffer> {
  await assertStagedBlob(url);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('The staged upload could not be read.');
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Best-effort cleanup — staging copies are transient (Facebook either has
 * the file or the user re-stages it), so a failed delete never breaks the
 * response.
 */
export async function deleteStagedBlobs(urls: string[]): Promise<void> {
  if (!urls.length) return;
  try {
    await del(urls);
  } catch (error) {
    console.error(
      JSON.stringify({
        route: 'blob',
        event: 'delete_failed',
        count: urls.length,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
