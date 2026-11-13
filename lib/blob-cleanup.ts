/**
 * Best-effort staging cleanup for abandoned media; the blob is transient
 * either way, so failures are swallowed.
 */
export function deleteStagedBlob(url: string) {
  void fetch('/api/blob', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(() => {});
}
