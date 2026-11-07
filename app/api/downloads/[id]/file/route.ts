import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { downloadJobs } from "@/lib/downloads/jobs";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOWNLOAD_ROOT = path.join(os.homedir(), "Downloads", "VideoDownloader");

type RangeSelection = { start: number; end: number } | "full" | "invalid";

function parseRange(header: string | null, size: number): RangeSelection {
  if (!header) return "full";
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (match[1] === "") {
    // Suffix range ("bytes=-N"): the last N bytes.
    const length = Number(match[2]);
    if (length === 0) return "invalid";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start > end) return "invalid";
  return { start, end };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Video preview is available only in the local development app." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const job = downloadJobs.get(id);
  if (!job || job.workspaceId !== access.workspace.id) {
    return NextResponse.json({ error: "Download job not found." }, { status: 404 });
  }
  if (job.status !== "done" || !job.filePath) {
    return NextResponse.json(
      { error: "The video file is not ready yet." },
      { status: 409 }
    );
  }

  const resolved = path.resolve(job.filePath);
  if (!resolved.startsWith(`${DOWNLOAD_ROOT}${path.sep}`)) {
    return NextResponse.json({ error: "Download job not found." }, { status: 404 });
  }

  let size: number;
  try {
    const fileInfo = await stat(resolved);
    if (!fileInfo.isFile() || fileInfo.size === 0) {
      throw new Error("The saved file is empty.");
    }
    size = fileInfo.size;
  } catch {
    return NextResponse.json(
      { error: "The saved video is no longer on disk." },
      { status: 410 }
    );
  }

  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const start = range === "full" ? 0 : range.start;
  const end = range === "full" ? size - 1 : range.end;
  const stream = createReadStream(resolved, { start, end });
  const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  const fileName = resolved.split(path.sep).at(-1) ?? "video.mp4";

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
  if (range !== "full") {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }

  return new NextResponse(body, {
    status: range === "full" ? 200 : 206,
    headers,
  });
}
