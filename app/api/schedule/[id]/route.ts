import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";
import { recordScheduleEvent } from "@/lib/schedule-events";
import { cancelFacebookScheduledPost } from "@/lib/facebook";
import { resolvePageToken } from "@/lib/facebook-page-token";

export const dynamic = "force-dynamic";

type TargetRow = {
  id: number;
  workspace_id: string;
  news_item_id: number | null;
  kind: string;
  source: string;
  status: string;
  facebook_post_id: string | null;
  facebook_post_ids: unknown;
  page_id: string | null;
};

type PageResult = {
  page: { id: string; name: string };
  ok: boolean;
  id?: string;
  permalink?: string | null;
  error?: string;
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const { id } = await params;

  const existing = (await sql`
    SELECT id, workspace_id, news_item_id, kind, source, status,
           facebook_post_id, facebook_post_ids, page_id
    FROM scheduled_posts
    WHERE id = ${id} AND workspace_id = ${access.workspace.id}
  `) as unknown as TargetRow[];

  const row = existing[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (row.source === "facebook" && row.status === "scheduled") {
    // Facebook is holding this item in its own queue, so deleting the local
    // row would not stop it. Cancel it on Facebook first.
    const cancelled = await cancelOnFacebook(row);
    if (!cancelled.ok) {
      return NextResponse.json(
        {
          error:
            cancelled.error ??
            "This item is scheduled on Facebook itself and could not be cancelled automatically. Cancel it in Meta Business Suite, then this entry clears on its own.",
        },
        { status: 409 }
      );
    }
  }

  const rows = (await sql`
    DELETE FROM scheduled_posts
    WHERE id = ${id}
      AND workspace_id = ${access.workspace.id}
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

/**
 * Cancel a Facebook-held scheduled item. One scheduled action can cover
 * several Pages, so every Page that took it is cancelled in turn; the first
 * failure stops the loop and is reported back to the user.
 */
async function cancelOnFacebook(
  row: TargetRow
): Promise<{ ok: boolean; error?: string }> {
  const perPage = Array.isArray(row.facebook_post_ids)
    ? (row.facebook_post_ids as PageResult[]).filter(
        (entry) => entry?.ok && entry.id
      )
    : [];

  const targets = perPage.length
    ? perPage.map((entry) => ({ pageId: entry.page?.id, postId: entry.id! }))
    : row.facebook_post_id
      ? [{ pageId: row.page_id, postId: row.facebook_post_id }]
      : [];

  if (!targets.length) {
    return {
      ok: false,
      error:
        "This item is scheduled on Facebook but the app has no id for it, so it cannot be cancelled here. Cancel it in Meta Business Suite.",
    };
  }

  for (const target of targets) {
    const token = await resolvePageToken(row.workspace_id, target.pageId);
    if (!token) {
      return {
        ok: false,
        error:
          "The stored Page token is unreadable, so this item cannot be cancelled. Reconnect the Page, or cancel it in Meta Business Suite.",
      };
    }

    try {
      await cancelFacebookScheduledPost(target.postId, token);
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Facebook refused to cancel this item: ${error.message} You can cancel it in Meta Business Suite instead.`
            : "Facebook refused to cancel this item. You can cancel it in Meta Business Suite instead.",
      };
    }
  }

  return { ok: true };
}
