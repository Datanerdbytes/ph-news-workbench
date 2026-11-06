import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { MAX_POST_IMAGES } from "@/lib/facebook";
import { requireWorkspace, unauthorized } from "@/lib/session";
import { stripMarkdown } from "@/lib/format";
import { recordScheduleEvent } from "@/lib/schedule-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const rows = await sql`
    SELECT s.id, s.news_item_id, s.draft_id, s.text, s.image_url, s.image_urls,
           s.scheduled_for, s.status, s.kind, s.source, s.page_id,
           s.facebook_post_id, s.attempts, s.error_message,
           s.created_at, n.title AS news_title
    FROM scheduled_posts s
    LEFT JOIN news_items n ON n.id = s.news_item_id
    WHERE s.workspace_id = ${access.workspace.id}
    ORDER BY (s.status = 'scheduled') DESC, s.scheduled_for ASC
    LIMIT 500`;

  return NextResponse.json(rows, {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? stripMarkdown(body.text) : "";
  if (!text.trim()) {
    return NextResponse.json(
      { error: "Write a post before scheduling it." },
      { status: 400 }
    );
  }

  const scheduledFor = new Date(String(body?.scheduledFor ?? ""));
  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json(
      { error: "Pick a date and time to schedule." },
      { status: 400 }
    );
  }
  if (scheduledFor.getTime() < Date.now() + 60_000) {
    return NextResponse.json(
      { error: "Scheduled time must be at least a minute from now." },
      { status: 400 }
    );
  }

  const newsItemId = Number(body?.newsItemId);
  const draftId = Number(body?.draftId);
  const rawImages = Array.isArray(body?.imageUrls)
    ? body.imageUrls
    : typeof body?.imageUrl === "string"
      ? [body.imageUrl]
      : [];
  const imageUrls = rawImages
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
    .slice(0, MAX_POST_IMAGES);

  // Optional target page — validated against the workspace's connected pages;
  // null lets the executor fall back to the default (primary) page.
  const requestedPageId =
    typeof body?.pageId === "string" && body.pageId ? body.pageId : null;
  let scheduledPageId: string | null = null;
  if (requestedPageId) {
    const pageRows = (await sql`
      SELECT page_id FROM facebook_pages
      WHERE workspace_id = ${access.workspace.id} AND page_id = ${requestedPageId}
    `) as unknown as { page_id: string }[];
    if (!pageRows.length) {
      return NextResponse.json(
        { error: "That Page is not connected to this workspace." },
        { status: 404 }
      );
    }
    scheduledPageId = requestedPageId;
  }

  const rows = (await sql`
    INSERT INTO scheduled_posts
      (workspace_id, news_item_id, draft_id, text, image_url, image_urls, scheduled_for, page_id, created_by)
    VALUES
      (${access.workspace.id},
       ${Number.isInteger(newsItemId) && newsItemId > 0 ? newsItemId : null},
       ${Number.isInteger(draftId) && draftId > 0 ? draftId : null},
       ${text},
       ${imageUrls[0] ?? null},
       ${imageUrls.length ? JSON.stringify(imageUrls) : null}::jsonb,
       ${scheduledFor.toISOString()}, ${scheduledPageId}, ${access.user.id})
    RETURNING id, news_item_id, scheduled_for, status`) as unknown as {
    id: number;
    news_item_id: number | null;
    scheduled_for: string;
    status: string;
  }[];

  const created = rows[0];

  await recordScheduleEvent({
    workspaceId: access.workspace.id,
    scheduledPostId: created.id,
    newsItemId: created.news_item_id,
    event: "scheduled",
    source: "composer",
    actorUserId: access.user.id,
    metadata: {
      scheduledFor: scheduledFor.toISOString(),
      imageCount: imageUrls.length,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
