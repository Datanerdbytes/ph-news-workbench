export type DownloadStatus =
  | "queued"
  | "fetching"
  | "downloading"
  | "finalizing"
  | "done"
  | "failed";

export type DownloadJob = {
  id: string;
  workspaceId: string;
  userId: string;
  platform: string;
  quality: string;
  status: DownloadStatus;
  progress: number | null;
  statusMessage: string;
  filePath: string | null;
  error: string | null;
  logs: string[];
  createdAt: number;
};

type DownloadGlobal = typeof globalThis & {
  __videoDownloadJobs?: Map<string, DownloadJob>;
};

const globalState = globalThis as DownloadGlobal;

export const downloadJobs =
  globalState.__videoDownloadJobs ??
  (globalState.__videoDownloadJobs = new Map<string, DownloadJob>());

export function publicDownloadJob(job: DownloadJob) {
  return {
    id: job.id,
    platform: job.platform,
    quality: job.quality,
    status: job.status,
    progress: job.progress,
    statusMessage: job.statusMessage,
    fileName: job.filePath ? job.filePath.split(/[\\/]/).at(-1) : null,
    saveLocation: job.filePath,
    error: job.error,
    createdAt: job.createdAt,
  };
}
