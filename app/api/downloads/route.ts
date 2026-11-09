import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { discoverDiskDownloads, publicDiskDownload } from "@/lib/downloads/disk-jobs";
import { publicDownloadRow, type DownloadJobRow } from "@/lib/downloads/jobs";
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

const QUALITIES = new Set(["best", "1080", "720", "480"]);

const JOB_COLUMNS = `id, platform, quality, status, progress, status_message,
  file_name, blob_url, save_location, error,
  extract(epoch from created_at) * 1000 AS created_at_ms`;

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

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const rows = (await sql`
    SELECT ${sql.unsafe(JOB_COLUMNS)}
    FROM download_jobs
    WHERE workspace_id = ${access.workspace.id}
    ORDER BY created_at DESC
    LIMIT 20
  `) as DownloadJobRow[];
  let jobs: Array<
    ReturnType<typeof publicDownloadRow> | ReturnType<typeof publicDiskDownload>
  > = rows.map(publicDownloadRow);

  // Files downloaded before the queue existed still live on the dev machine's
  // disk; surface them there only.
  if (process.env.NODE_ENV === "development") {
    const diskJobs = (await discoverDiskDownloads())
      .filter((disk) => !jobs.some((job) => job.saveLocation === disk.filePath))
      .map(publicDiskDownload);
    jobs = [...jobs, ...diskJobs]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
  }

  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

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
  const quality = typeof body?.quality === "string" ? body.quality : "best";
  if (!QUALITIES.has(quality)) {
    return NextResponse.json(
      { error: "Choose a supported video quality." },
      { status: 400 }
    );
  }

  const active = await sql`
    SELECT count(*)::int AS active
    FROM download_jobs
    WHERE workspace_id = ${access.workspace.id}
      AND status IN ('queued', 'fetching', 'downloading', 'finalizing')
  `;
  if (active[0].active >= 2) {
    return NextResponse.json(
      { error: "Two downloads are already running. Wait for one to finish first." },
      { status: 429 }
    );
  }

  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO download_jobs
      (id, workspace_id, user_id, platform, url, quality, status, status_message)
    VALUES
      (${id}, ${access.workspace.id}, ${access.user.id}, ${platform.name},
       ${url}, ${quality}, 'queued', 'Waiting for the local downloader…')
    RETURNING ${sql.unsafe(JOB_COLUMNS)}
  `) as DownloadJobRow[];

  return NextResponse.json({ job: publicDownloadRow(rows[0]) }, { status: 202 });
}
