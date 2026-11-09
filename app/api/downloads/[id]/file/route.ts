import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { downloadRoot, findDiskDownload, videoContentType } from "@/lib/downloads/disk-jobs";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const { id } = await params;
  const forceDownload = new URL(request.url).searchParams.has("download");

  if (!id.startsWith("disk-")) {
    const rows = await sql`
      SELECT status, blob_url
      FROM download_jobs
      WHERE id = ${id} AND workspace_id = ${access.workspace.id}
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Download job not found." }, { status: 404 });
    }
    if (rows[0].status !== "done" || !rows[0].blob_url) {
      return NextResponse.json(
        { error: "The video file is not ready yet." },
        { status: 409 }
      );
    }
    // The Blob CDN serves range requests natively; ?download=1 forces an
    // attachment with the stored file name.
    const target = forceDownload
      ? `${rows[0].blob_url}?download=1`
      : rows[0].blob_url;
    const response = NextResponse.redirect(target, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const disk = await findDiskDownload(id);
  const filePath = disk?.filePath ?? null;
  if (!filePath) {
    return NextResponse.json({ error: "Download job not found." }, { status: 404 });
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(`${downloadRoot()}${path.sep}`)) {
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
    "Content-Type": videoContentType(resolved),
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
  if (range !== "full") {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }

  return new NextResponse(body, {
    status: range === "full" ? 200 : 206,
    headers,
  });
}
