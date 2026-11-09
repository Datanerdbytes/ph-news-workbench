/**
 * Pulls a finished download back into the Reels composer. The worker uploads
 * a Safari-safe H.264 rendition, so the imported file previews everywhere.
 */

export type DownloadedVideo = {
  file: File;
  fileName: string;
  platform: string;
};

/** Reads the `?video=<jobId>` handoff parameter from a query string. */
export function parseVideoParam(search: string): string | null {
  const params = new URLSearchParams(search);
  const value = params.get("video")?.trim();
  return value ? value : null;
}

export async function fetchDownloadedVideo(jobId: string): Promise<DownloadedVideo> {
  const meta = await fetch(`/api/downloads/${jobId}`, { cache: "no-store" });
  const metaData = (await meta.json().catch(() => null)) as
    | { job?: { fileName?: string | null; platform?: string }; error?: string }
    | null;
  if (!meta.ok) {
    throw new Error(metaData?.error ?? "The download could not be opened.");
  }

  const res = await fetch(`/api/downloads/${jobId}/file`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("The downloaded video file is not ready yet.");
  }
  const blob = await res.blob();
  const fileName = metaData?.job?.fileName?.trim() || `${jobId}.mp4`;
  return {
    file: new File([blob], fileName, { type: blob.type || "video/mp4" }),
    fileName,
    platform: metaData?.job?.platform ?? "",
  };
}
