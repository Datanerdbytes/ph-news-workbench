import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { deleteStagedBlobs } from "@/lib/blob";
import { findDiskDownload, publicDiskDownload } from "@/lib/downloads/disk-jobs";
import {
  ACTIVE_DOWNLOAD_STATUSES,
  publicDownloadRow,
  type DownloadJobRow,
} from "@/lib/downloads/jobs";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_COLUMNS = `id, platform, quality, status, progress, status_message,
  file_name, blob_url, save_location, error,
  extract(epoch from created_at) * 1000 AS created_at_ms`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  if (id.startsWith("disk-")) {
    const disk = await findDiskDownload(id);
    if (!disk) {
      return NextResponse.json({ error: "Download job not found." }, { status: 404 });
    }
    return NextResponse.json({ job: publicDiskDownload(disk) });
  }

  const rows = (await sql`
    SELECT ${sql.unsafe(JOB_COLUMNS)}
    FROM download_jobs
    WHERE id = ${id} AND workspace_id = ${access.workspace.id}
  `) as DownloadJobRow[];
  if (!rows.length) {
    return NextResponse.json({ error: "Download job not found." }, { status: 404 });
  }
  return NextResponse.json({ job: publicDownloadRow(rows[0]) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const rows = await sql`
    SELECT status, blob_url
    FROM download_jobs
    WHERE id = ${id} AND workspace_id = ${access.workspace.id}
  `;
  if (!rows.length) {
    return NextResponse.json({ error: "Download job not found." }, { status: 404 });
  }
  if (ACTIVE_DOWNLOAD_STATUSES.includes(rows[0].status)) {
    return NextResponse.json(
      { error: "An active download cannot be removed." },
      { status: 409 }
    );
  }

  await sql`
    DELETE FROM download_jobs
    WHERE id = ${id} AND workspace_id = ${access.workspace.id}
  `;
  if (rows[0].blob_url) {
    await deleteStagedBlobs([rows[0].blob_url]);
  }
  return new Response(null, { status: 204 });
}
