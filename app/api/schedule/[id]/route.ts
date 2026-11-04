import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";
import { recordScheduleEvent } from "@/lib/schedule-events";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;
  const rows = (await sql`
    DELETE FROM scheduled_posts
    WHERE id = ${id}
      AND workspace_id = ${access.workspace.id}
      AND status = 'scheduled'
    RETURNING id, news_item_id, scheduled_for`) as unknown as {
    id: number;
    news_item_id: number | null;
    scheduled_for: string;
  }[];

  if (!rows.length) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const canceled = rows[0];
  await recordScheduleEvent({
    workspaceId: access.workspace.id,
    scheduledPostId: canceled.id,
    newsItemId: canceled.news_item_id,
    event: "canceled",
    source: "calendar",
    actorUserId: access.user.id,
    metadata: { scheduledFor: canceled.scheduled_for },
  });

  return NextResponse.json({ deleted: true });
}
