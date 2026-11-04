import { NextResponse } from "next/server";
import { downloadJobs, publicDownloadJob } from "@/lib/downloads/jobs";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const job = downloadJobs.get(id);
  if (!job || job.workspaceId !== access.workspace.id) {
    return NextResponse.json({ error: "Download job not found." }, { status: 404 });
  }
  return NextResponse.json({ job: publicDownloadJob(job) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const job = downloadJobs.get(id);
  if (!job || job.workspaceId !== access.workspace.id) {
    return NextResponse.json({ error: "Download job not found." }, { status: 404 });
  }
  if (
    job.status === "queued" ||
    job.status === "fetching" ||
    job.status === "downloading" ||
    job.status === "finalizing"
  ) {
    return NextResponse.json(
      { error: "An active download cannot be removed." },
      { status: 409 }
    );
  }

  downloadJobs.delete(id);
  return new Response(null, { status: 204 });
}
