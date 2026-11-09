import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

// Local companion to the hosted app: claims queued download_jobs rows from the
// shared database, runs yt-dlp on this machine, and uploads the finished file
// to Vercel Blob so the live app can serve it. Run with:
//   node --env-file=.env.local download-worker.ts

export const QUALITY_FORMATS: Record<string, string> = {
  best: "bestvideo+bestaudio/best",
  "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
  "720": "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
  "480": "bestvideo[height<=480]+bestaudio/best[height<=480]/best",
};

export function pythonExecutable(): string {
  if (process.env.YTDLP_PYTHON) return process.env.YTDLP_PYTHON;
  const suffix = process.platform === "win32" ? "Scripts/python.exe" : "bin/python";
  return path.join(os.homedir(), "python-project", "Projects", "YT_DLP", "my_venv", suffix);
}

export function downloadRoot(): string {
  return (
    process.env.VIDEO_DOWNLOADER_ROOT ||
    path.join(os.homedir(), "Downloads", "VideoDownloader")
  );
}

export function buildYtdlpArgs(format: string, outputDirectory: string, url: string): string[] {
  return [
    "-m",
    "yt_dlp",
    "--no-update",
    "--no-playlist",
    "--newline",
    "--no-colors",
    "--js-runtimes",
    "node",
    "--format",
    format,
    "--merge-output-format",
    "mp4",
    "--output",
    path.join(outputDirectory, "%(title).180B [%(id)s].%(ext)s"),
    "--print",
    "after_move:filepath",
    url,
  ];
}

export function contentTypeFor(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".webm") return "video/webm";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".mov") return "video/quicktime";
  return "video/mp4";
}

// Vercel Blob derives the ?download=1 attachment name from the stored path, so
// spaces and brackets would otherwise reach the user percent-encoded.
export function blobFileName(fileName: string): string {
  const clean = fileName
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+\.(\w+)$/, ".$1");
  return clean || "video.mp4";
}

export type OutputUpdate = {
  status?: "downloading" | "finalizing";
  statusMessage?: string;
  progress?: number;
  filePath?: string;
};

export function parseOutputLine(
  line: string,
  platform: string,
  outputDirectory: string
): OutputUpdate {
  const update: OutputUpdate = {};
  if (!line) return update;

  if (/Extracting URL:/i.test(line)) {
    update.statusMessage = "Opening video link…";
  } else if (/Downloading webpage|Downloading initial data/i.test(line)) {
    update.statusMessage = `Connecting to ${platform}…`;
  } else if (/Downloading .*?(?:JSON|API|metadata)|Extracting.*information/i.test(line)) {
    update.statusMessage = "Checking video details…";
  } else if (/manifest|m3u8|MPD|format data/i.test(line)) {
    update.statusMessage = "Preparing video streams…";
  } else if (/Destination:/i.test(line)) {
    update.status = "downloading";
    update.statusMessage = "Preparing video file…";
  } else if (/Merging formats|ffmpeg|post-process/i.test(line)) {
    update.status = "finalizing";
    update.statusMessage = "Finishing video…";
  }

  const progress = line.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);
  if (progress) {
    update.progress = Math.max(0, Math.min(100, Number(progress[1])));
    update.status = "downloading";
    update.statusMessage = "Downloading video…";
  }

  const candidate = line.trim();
  if (path.isAbsolute(candidate)) {
    const resolved = path.resolve(candidate);
    if (resolved.startsWith(`${path.resolve(outputDirectory)}${path.sep}`)) {
      update.filePath = resolved;
    }
  }
  return update;
}

type Sql = ReturnType<typeof neon<false, false>>;

type ClaimedJob = {
  id: string;
  workspace_id: string;
  platform: string;
  url: string;
  quality: string;
};

type ActiveJob = {
  child: ChildProcess | null;
  cancelled: boolean;
  heartbeat: ReturnType<typeof setInterval>;
};

const POLL_MS = 3000;
const MAX_CONCURRENT = 2;
const MAX_ATTEMPTS = 3;
const STALE_MINUTES = 3;
const WRITE_THROTTLE_MS = 1000;
const HEARTBEAT_MS = 30_000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function runJob(sql: Sql, job: ClaimedJob, active: Map<string, ActiveJob>, isShuttingDown: () => boolean) {
  const format = QUALITY_FORMATS[job.quality] ?? QUALITY_FORMATS.best;
  const outputDirectory = path.join(downloadRoot(), job.platform, job.id);
  const state = {
    status: "fetching" as string,
    statusMessage: `Connecting to ${job.platform}…`,
    progress: null as number | null,
    filePath: null as string | null,
    logs: [] as string[],
    lastWrite: 0,
  };
  const entry: ActiveJob = {
    child: null,
    cancelled: false,
    heartbeat: setInterval(() => void writeState(true), HEARTBEAT_MS),
  };
  active.set(job.id, entry);

  async function writeState(force = false) {
    if (entry.cancelled || isShuttingDown()) return;
    const now = Date.now();
    if (!force && now - state.lastWrite < WRITE_THROTTLE_MS) return;
    state.lastWrite = now;
    try {
      await sql`
        UPDATE download_jobs
        SET status = ${state.status}, progress = ${state.progress},
            status_message = ${state.statusMessage}, updated_at = now()
        WHERE id = ${job.id}
      `;
    } catch (error) {
      console.error(`Could not update job ${job.id}:`, error);
    }
  }

  function recordChunk(chunk: Buffer, previous: string): string {
    const lines = `${previous}${chunk.toString("utf8")}`.split(/\r?\n/);
    const remainder = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      state.logs.push(line.slice(-1000));
      if (state.logs.length > 12) state.logs.shift();
      const update = parseOutputLine(line, job.platform, outputDirectory);
      if (update.status) state.status = update.status;
      if (update.statusMessage) state.statusMessage = update.statusMessage;
      if (update.progress !== undefined) state.progress = update.progress;
      if (update.filePath) state.filePath = update.filePath;
      void writeState();
    }
    return remainder;
  }

  let settled = false;
  async function finishFailure(message: string) {
    if (settled || entry.cancelled || isShuttingDown()) return;
    settled = true;
    clearInterval(entry.heartbeat);
    try {
      await sql`
        UPDATE download_jobs
        SET status = 'failed', status_message = 'Download failed.',
            error = ${message}, updated_at = now()
        WHERE id = ${job.id}
      `;
    } catch (error) {
      console.error(`Could not record failure for ${job.id}:`, error);
    }
    console.error(`Failed ${job.platform} job ${job.id}: ${message}`);
    active.delete(job.id);
  }

  try {
    await mkdir(outputDirectory, { recursive: true });
    const child = spawn(pythonExecutable(), buildYtdlpArgs(format, outputDirectory, job.url), {
      cwd: outputDirectory,
      env: {
        PATH: process.env.PATH,
        HOME: os.homedir(),
        TMPDIR: os.tmpdir(),
        TEMP: os.tmpdir(),
        NODE_ENV: process.env.NODE_ENV ?? "development",
      },
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    entry.child = child;
    console.log(`Downloading ${job.platform} video for job ${job.id}…`);

    let stdoutBuffer = "";
    let stderrBuffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer = recordChunk(chunk, stdoutBuffer);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer = recordChunk(chunk, stderrBuffer);
    });
    child.once("error", (error) => {
      void finishFailure(`Could not start yt-dlp: ${error.message}`);
    });
    child.once("close", async (code) => {
      if (settled || entry.cancelled || isShuttingDown()) {
        clearInterval(entry.heartbeat);
        active.delete(job.id);
        return;
      }
      if (stdoutBuffer) recordChunk(Buffer.from("\n"), stdoutBuffer);
      if (stderrBuffer) recordChunk(Buffer.from("\n"), stderrBuffer);
      try {
        if (code !== 0) {
          throw new Error(state.logs.slice(-4).join("\n") || `yt-dlp exited with code ${code}.`);
        }
        if (!state.filePath) {
          throw new Error("yt-dlp finished but did not report a saved video file.");
        }
        const fileInfo = await stat(state.filePath);
        if (!fileInfo.isFile() || fileInfo.size === 0) {
          throw new Error("The downloaded file is empty.");
        }
        const fileName = path.basename(state.filePath);
        state.status = "finalizing";
        state.statusMessage = "Uploading to the cloud library…";
        await writeState(true);
        const blob = await put(
          `downloads/${job.workspace_id}/${job.id}/${blobFileName(fileName)}`,
          createReadStream(state.filePath),
          {
            access: "public",
            contentType: contentTypeFor(fileName),
            addRandomSuffix: false,
            allowOverwrite: true,
          }
        );
        settled = true;
        clearInterval(entry.heartbeat);
        await sql`
          UPDATE download_jobs
          SET status = 'done', progress = 100, status_message = 'Download complete.',
              file_name = ${fileName}, blob_url = ${blob.url}, file_size = ${fileInfo.size},
              save_location = ${state.filePath}, error = NULL, updated_at = now()
          WHERE id = ${job.id}
        `;
        console.log(`Done: ${fileName} is in the cloud library.`);
        active.delete(job.id);
      } catch (error) {
        await finishFailure(error instanceof Error ? error.message : "Download failed.");
      }
    });
  } catch (error) {
    await finishFailure(error instanceof Error ? error.message : "Could not start the download.");
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL is required. Run with: node --env-file=.env.local download-worker.ts");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    fail("BLOB_READ_WRITE_TOKEN is required so finished videos reach the live app's cloud library.");
  }
  const sql = neon(process.env.DATABASE_URL);
  const workerId = `worker-${randomUUID()}`;

  const versionCheck = spawn(pythonExecutable(), ["-m", "yt_dlp", "--version"], {
    stdio: "ignore",
  });
  const canRun = await new Promise<boolean>((resolve) => {
    versionCheck.once("error", () => resolve(false));
    versionCheck.once("close", (code) => resolve(code === 0));
  });
  if (!canRun) {
    fail(
      "Could not start yt-dlp. Install it in the Python environment at " +
        `${pythonExecutable()} or point YTDLP_PYTHON at one that has it.`
    );
  }

  let shuttingDown = false;
  const active = new Map<string, ActiveJob>();

  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("Shutting down; requeueing active downloads…");
    for (const entry of active.values()) {
      entry.cancelled = true;
      clearInterval(entry.heartbeat);
      entry.child?.kill("SIGTERM");
    }
    try {
      await sql`
        UPDATE download_jobs
        SET status = 'queued', worker_id = NULL, claimed_at = NULL,
            status_message = 'Waiting for the local downloader…', updated_at = now()
        WHERE worker_id = ${workerId}
          AND status IN ('fetching', 'downloading', 'finalizing')
      `;
    } catch (error) {
      console.error("Could not requeue active jobs:", error);
    }
    process.exit(0);
  }
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  console.log(`Download worker ready (${workerId}). Videos save to ${downloadRoot()} and sync to the cloud library.`);

  while (!shuttingDown) {
    try {
      await sql`
        UPDATE download_jobs
        SET status = CASE WHEN attempts < ${MAX_ATTEMPTS} THEN 'queued' ELSE 'failed' END,
            worker_id = NULL, claimed_at = NULL,
            status_message = CASE WHEN attempts < ${MAX_ATTEMPTS}
              THEN 'Waiting for the local downloader…' ELSE 'Download failed.' END,
            error = CASE WHEN attempts < ${MAX_ATTEMPTS}
              THEN NULL ELSE 'The local downloader stopped responding.' END,
            updated_at = now()
        WHERE status IN ('fetching', 'downloading', 'finalizing')
          AND updated_at < now() - ${STALE_MINUTES} * interval '1 minute'
      `;
      while (!shuttingDown && active.size < MAX_CONCURRENT) {
        const rows = (await sql`
          UPDATE download_jobs
          SET status = 'fetching', worker_id = ${workerId}, claimed_at = now(),
              updated_at = now(), attempts = attempts + 1,
              status_message = 'Connecting to ' || platform || '…'
          WHERE id = (
            SELECT id FROM download_jobs
            WHERE status = 'queued'
            ORDER BY created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, workspace_id, platform, url, quality
        `) as ClaimedJob[];
        if (!rows.length) break;
        void runJob(sql, rows[0], active, () => shuttingDown);
      }
    } catch (error) {
      console.error("Queue poll failed:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}