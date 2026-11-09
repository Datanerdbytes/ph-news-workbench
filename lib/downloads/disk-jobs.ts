import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type DiskDownload = {
  id: string;
  platform: string;
  filePath: string;
  fileName: string;
  createdAt: number;
};

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mkv", ".mov", ".m4v"];

export function downloadRoot() {
  if (process.env.VIDEO_DOWNLOADER_ROOT) {
    return path.resolve(process.env.VIDEO_DOWNLOADER_ROOT);
  }
  return path.join(os.homedir(), "Downloads", "VideoDownloader");
}

export function diskJobId(relativePath: string) {
  return `disk-${createHash("sha1").update(relativePath).digest("hex").slice(0, 24)}`;
}

/** Recovers finished downloads from ~/Downloads/VideoDownloader/{platform}/{job}/{file}. */
export async function discoverDiskDownloads(
  root = downloadRoot()
): Promise<DiskDownload[]> {
  let platforms: string[];
  try {
    platforms = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const files: DiskDownload[] = [];
  for (const platform of platforms) {
    let jobs: string[];
    try {
      jobs = (await readdir(path.join(root, platform), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }
    for (const job of jobs) {
      let names: string[];
      try {
        names = await readdir(path.join(root, platform, job));
      } catch {
        continue;
      }
      for (const name of names) {
        if (!VIDEO_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))) {
          continue;
        }
        const filePath = path.join(root, platform, job, name);
        try {
          const info = await stat(filePath);
          if (!info.isFile() || info.size === 0) continue;
          files.push({
            id: diskJobId(path.join(platform, job, name)),
            platform,
            filePath,
            fileName: name,
            createdAt: info.mtimeMs,
          });
        } catch {
          // Removed between listing and stat; skip.
        }
      }
    }
  }
  return files.sort((a, b) => b.createdAt - a.createdAt);
}

export function findDiskDownload(id: string, root = downloadRoot()) {
  if (!id.startsWith("disk-")) return null;
  return discoverDiskDownloads(root).then((files) => files.find((f) => f.id === id) ?? null);
}

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

export function videoContentType(fileName: string) {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? "video/mp4";
}

/** Shapes a recovered file like a finished job so the page renders it directly. */
export function publicDiskDownload(disk: DiskDownload) {
  return {
    id: disk.id,
    platform: disk.platform,
    quality: "",
    status: "done" as const,
    progress: null,
    statusMessage: "",
    fileName: disk.fileName,
    saveLocation: disk.filePath,
    error: null,
    createdAt: disk.createdAt,
    source: "disk" as const,
  };
}
