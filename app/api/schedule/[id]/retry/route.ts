import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";
import { recordScheduleEvent, type ScheduleEventSource } from "@/lib/schedule-events";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const postId = Number(id);

  // Verify the post exists and belongs to this workspace
  const existing = (await sql`
    SELECT id, workspace_id, news_item_id, status, attempts, kind
    FROM scheduled_posts
    WHERE id = ${postId} AND workspace_id = ${access.workspace.id}
  `) as unknown as {
    id: number;
    workspace_id: string;
    news_item_id: number | null;
    status: string;
    attempts: number;
    kind: string;
  }[];

  const post = existing[0];
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (post.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed posts can be retried." },
      { status: 400 }
    );
  }

  // Reset for retry: clear error, reset attempts, set back to scheduled
  await sql`
    UPDATE scheduled_posts
    SET status = 'scheduled', attempts = 0, error_message = NULL, updated_at = now()
    WHERE id = ${postId}
  `;

  // Record the retry event in activity log
  await recordScheduleEvent({
    workspaceId: access.workspace.id,
    scheduledPostId: postId,
    newsItemId: post.news_item_id,
    event: "retrying",
    source: "manual",
    actorUserId: access.user.id,
    metadata: { retriedBy: access.user.id, previousAttempts: post.attempts },
  });

  return NextResponse.json({ ok: true, status: "scheduled" });
}