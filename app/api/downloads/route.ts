import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { discoverDiskDownloads, publicDiskDownload } from "@/lib/downloads/disk-jobs";
import { downloadJobs, publicDownloadJob, type DownloadJob } from "@/lib/downloads/jobs";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PLATFORM_HOSTS = [
  { name: "YouTube", hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  { name: "Facebook", hosts: ["facebook.com", "fb.watch"] },
  { name: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  { name: "X", hosts: ["x.com", "twitter.com", "t.co"] },
  { name: "Reddit", hosts: ["reddit.com", "redd.it", "v.redd.it"] },
  { name: "TikTok", hosts: ["tiktok.com"] },
] as const;

const QUALITY_FORMATS: Record<string, string> = {
  best: "bestvideo+bestaudio/best",
  "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
  "720": "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
  "480": "bestvideo[height<=480]+bestaudio/best[height<=480]/best",
};

function platformForUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const platform = PLATFORM_HOSTS.find((platform) =>
      platform.hosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`)
      )
    ) ?? null;
    return platform ? { platform, url: url.href } : null;
  } catch {
    return null;
  }
}

function pythonExecutable() {
  if (process.env.YTDLP_PYTHON) return process.env.YTDLP_PYTHON;
  const suffix = process.platform === "win32" ? "Scripts/python.exe" : "bin/python";
  return path.join(
    os.homedir(),
    "python-project",
    "Projects",
    "YT_DLP",
    "my_venv",
    suffix
  );
}

function recordOutput(
  job: DownloadJob,
  chunk: Buffer,
  outputDirectory: string,
  previous = ""
): string {
  const lines = `${previous}${chunk.toString("utf8")}`.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    if (!line) continue;
    job.logs.push(line.slice(-1000));
    if (job.logs.length > 12) job.logs.shift();

    if (/Extracting URL:/i.test(line)) {
      job.statusMessage = "Opening video link…";
    } else if (/Downloading webpage|Downloading initial data/i.test(line)) {
      job.statusMessage = `Connecting to ${job.platform}…`;
    } else if (/Downloading .*?(?:JSON|API|metadata)|Extracting.*information/i.test(line)) {
      job.statusMessage = "Checking video details…";
    } else if (/manifest|m3u8|MPD|format data/i.test(line)) {
      job.statusMessage = "Preparing video streams…";
    } else if (/Destination:/i.test(line)) {
      job.status = "downloading";
      job.statusMessage = "Preparing video file…";
    } else if (/Merging formats|ffmpeg|post-process/i.test(line)) {
      job.status = "finalizing";
      job.statusMessage = "Finishing video…";
    }

    const progress = line.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);
    if (progress) {
      job.progress = Math.max(0, Math.min(100, Number(progress[1])));
      job.status = "downloading";
      job.statusMessage = "Downloading video…";
    }

    const candidate = line.trim();
    if (!path.isAbsolute(candidate)) continue;
    const resolved = path.resolve(candidate);
    if (resolved.startsWith(`${path.resolve(outputDirectory)}${path.sep}`)) {
      job.filePath = resolved;
    }
  }
  return remainder;
}

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const sessionJobs = [...downloadJobs.values()]
    .filter((job) => job.workspaceId === access.workspace.id)
    .map(publicDownloadJob);
  const diskJobs = (await discoverDiskDownloads())
    .filter((disk) => !sessionJobs.some((job) => job.saveLocation === disk.filePath))
    .map(publicDiskDownload);
  const jobs = [...sessionJobs, ...diskJobs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Video downloads are available only in the local development app." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { url?: unknown; quality?: unknown }
    | null;
  const parsedUrl = platformForUrl(body?.url);
  if (!parsedUrl) {
    return NextResponse.json(
      { error: "Enter a valid public URL from a supported video platform." },
      { status: 400 }
    );
  }
  const { platform, url } = parsedUrl;
  const quality =
    typeof body?.quality === "string" ? body.quality : "best";
  const format = QUALITY_FORMATS[quality];
  if (!format) {
    return NextResponse.json({ error: "Choose a supported video quality." }, { status: 400 });
  }

  const activeJobs = [...downloadJobs.values()].filter(
    (job) =>
      job.workspaceId === access.workspace.id &&
      (job.status === "queued" ||
        job.status === "fetching" ||
        job.status === "downloading" ||
        job.status === "finalizing")
  ).length;
  if (activeJobs >= 2) {
    return NextResponse.json(
      { error: "Two downloads are already running. Wait for one to finish first." },
      { status: 429 }
    );
  }

  const id = randomUUID();
  const outputDirectory = path.join(
    os.homedir(),
    "Downloads",
    "VideoDownloader",
    platform.name,
    id
  );
  const job: DownloadJob = {
    id,
    workspaceId: access.workspace.id,
    userId: access.user.id,
    platform: platform.name,
    quality,
    status: "fetching",
    progress: null,
    statusMessage: `Connecting to ${platform.name}…`,
    filePath: null,
    error: null,
    logs: [],
    createdAt: Date.now(),
  };
  downloadJobs.set(id, job);

  const python = pythonExecutable();
  const versionCheck = spawn(python, ["-m", "yt_dlp", "--version"], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      HOME: os.homedir(),
      NODE_ENV: process.env.NODE_ENV ?? "development",
    },
  });
  const canRun = await new Promise<boolean>((resolve) => {
    versionCheck.once("error", () => resolve(false));
    versionCheck.once("close", (code) => resolve(code === 0));
  });
  if (!canRun) {
    job.status = "failed";
    job.statusMessage = "Download could not start.";
    job.error =
      "Could not start yt-dlp. Check the Python environment at YTDLP_PYTHON or configure that environment variable.";
    return NextResponse.json(
      { error: job.error },
      { status: 503 }
    );
  }

  try {
    await mkdir(outputDirectory, { recursive: true });
  } catch (error) {
    console.error("Could not create the video download folder:", error);
    job.status = "failed";
    job.statusMessage = "Download could not start.";
    job.error = "Could not create the local download folder.";
    return NextResponse.json(
      { error: job.error },
      { status: 500 }
    );
  }

  try {
    const child = spawn(
      python,
      [
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
      ],
      {
        cwd: outputDirectory,
        env: {
          PATH: process.env.PATH,
          HOME: os.homedir(),
          TMPDIR: os.tmpdir(),
          TEMP: os.tmpdir(),
          NODE_ENV: process.env.NODE_ENV ?? "development",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    job.statusMessage = `Checking ${platform.name} for available video streams…`;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    child.stdout?.on("data", (chunk: Buffer) =>
      (stdoutBuffer = recordOutput(job, chunk, outputDirectory, stdoutBuffer))
    );
    child.stderr?.on("data", (chunk: Buffer) =>
      (stderrBuffer = recordOutput(job, chunk, outputDirectory, stderrBuffer))
    );
    child.once("error", (error) => {
      job.status = "failed";
      job.statusMessage = "Download failed.";
      job.error = `Could not start yt-dlp: ${error.message}`;
    });
    child.once("close", async (code) => {
      if (stdoutBuffer) {
        recordOutput(job, Buffer.from("\n"), outputDirectory, stdoutBuffer);
      }
      if (stderrBuffer) {
        recordOutput(job, Buffer.from("\n"), outputDirectory, stderrBuffer);
      }
      if (code !== 0) {
        job.status = "failed";
        job.statusMessage = "Download failed.";
        job.error =
          job.logs.slice(-4).join("\n") || `yt-dlp exited with code ${code}.`;
        return;
      }
      if (!job.filePath) {
        job.status = "failed";
        job.statusMessage = "Download failed.";
        job.error = "yt-dlp finished but did not report a saved video file.";
        return;
      }
      try {
        const fileInfo = await stat(job.filePath);
        if (!fileInfo.isFile() || fileInfo.size === 0) {
          throw new Error("The downloaded file is empty.");
        }
        job.status = "done";
        job.progress = 100;
        job.statusMessage = "Download complete.";
      } catch (error) {
        job.status = "failed";
        job.statusMessage = "Download failed.";
        job.error =
          error instanceof Error ? error.message : "The saved file could not be verified.";
      }
    });

    return NextResponse.json({ job: publicDownloadJob(job) }, { status: 202 });
  } catch (error) {
    job.status = "failed";
    job.error =
      error instanceof Error ? error.message : "Could not start the video download.";
    console.error("Could not spawn yt-dlp:", error);
    return NextResponse.json({ error: job.error }, { status: 500 });
  }
}
