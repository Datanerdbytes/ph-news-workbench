export type DownloadStatus =
  | "queued"
  | "fetching"
  | "downloading"
  | "finalizing"
  | "done"
  | "failed";

export const ACTIVE_DOWNLOAD_STATUSES: DownloadStatus[] = [
  "queued",
  "fetching",
  "downloading",
  "finalizing",
];

/** Row shape projected by the downloads routes (created_at as epoch ms). */
export type DownloadJobRow = {
  id: string;
  platform: string;
  quality: string;
  status: DownloadStatus;
  progress: number | null;
  status_message: string;
  file_name: string | null;
  blob_url: string | null;
  save_location: string | null;
  error: string | null;
  created_at_ms: number;
};

export function publicDownloadRow(row: DownloadJobRow) {
  return {
    id: row.id,
    platform: row.platform,
    quality: row.quality,
    status: row.status,
    progress: row.progress,
    statusMessage: row.status_message,
    fileName: row.file_name,
    saveLocation: row.save_location ?? (row.blob_url ? "Cloud library" : null),
    source: "cloud" as const,
    error: row.error,
    createdAt: row.created_at_ms,
  };
}