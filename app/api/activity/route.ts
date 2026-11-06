import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const dedupe = url.searchParams.get("dedupe") !== "false"; // default true
  const mergeByStory = url.searchParams.get("mergeByStory") === "true"; // opt-in

  // Get all schedule events, then deduplicate by scheduled_post_id (keep latest)
  const rawEvents = await sql`
    SELECT
      e.id,
      e.scheduled_post_id AS "scheduledPostId",
      e.news_item_id AS "newsItemId",
      e.event,
      e.source,
      e.actor_user_id AS "actorUserId",
      e.facebook_post_id AS "facebookPostId",
      e.error_message AS "errorMessage",
      e.metadata,
      e.created_at AS "createdAt",
      s.kind,
      s.source AS "scheduleSource",
      s.status,
      s.text,
      s.scheduled_for AS "scheduledFor",
      n.title AS "newsTitle"
    FROM scheduled_post_events e
    LEFT JOIN scheduled_posts s ON s.id = e.scheduled_post_id
    LEFT JOIN news_items n ON n.id = e.news_item_id
    WHERE e.workspace_id = ${access.workspace.id}
    ORDER BY e.created_at DESC
  `;

  let events: typeof rawEvents = [];

  if (dedupe && rawEvents.length > 0) {
    // Deduplicate by scheduledPostId (keep latest event per post)
    const eventsMap = new Map<number | string, typeof rawEvents[0]>();
    for (const e of rawEvents) {
      const key = e.scheduledPostId ?? `event-${e.id}`;
      if (!eventsMap.has(key) || new Date(e.createdAt) > new Date(eventsMap.get(key)!.createdAt)) {
        eventsMap.set(key, e);
      }
    }
    events = Array.from(eventsMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);
  } else {
    events = rawEvents.slice(offset, offset + limit);
  }

  const drafts = await sql`
    SELECT
      d.id,
      d.news_item_id AS "newsItemId",
      d.status,
      d.error_message AS "errorMessage",
      d.correlation_id AS "correlationId",
      d.created_at AS "createdAt",
      n.title AS "newsTitle",
      'draft'::text AS "event",
      'composer'::text AS "source",
      NULL::text AS "facebookPostId",
      NULL::jsonb AS "metadata",
      NULL::text AS "kind",
      NULL::text AS "scheduleSource",
      NULL::text AS "text",
      NULL::timestamptz AS "scheduledFor"
    FROM drafts d
    LEFT JOIN news_items n ON n.id = d.news_item_id
    WHERE d.workspace_id = ${access.workspace.id}
      -- A published draft that a scheduled post already put on Facebook is the
      -- same publish recorded twice (the worker flips this exact draft's
      -- status); the event row wins. Draft-grained, not story-grained: a
      -- regenerated draft republished through /api/publish records no event,
      -- so it stays visible even if the story was published before.
      AND NOT (
        d.status = 'published'
        AND EXISTS (
          SELECT 1
          FROM scheduled_post_events pe
          JOIN scheduled_posts sp ON sp.id = pe.scheduled_post_id
          WHERE sp.draft_id = d.id
            AND pe.workspace_id = d.workspace_id
            AND pe.event = 'published'
        )
      )
    ORDER BY d.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  type MergedEvent = {
  id: number | string;
  newsItemId: number | null;
  displayTime: string;
  type: "schedule" | "draft";
  event?: string; // schedule event type: scheduled, published, failed, canceled, retrying
  status?: string; // draft status or schedule status
  kind?: string | null;
  scheduleSource?: string | null;
  errorMessage?: string | null;
  displayTitle: string;
  [key: string]: unknown;
};

  // Helper: determine if an event represents a final/terminal state
  function isFinalScheduleEvent(event: string | undefined): boolean {
    return ["published", "failed", "canceled"].includes(event ?? "");
  }

  // Combine and sort by createdAt
  let allEvents: MergedEvent[] = [
    ...events.map((e) => ({
      id: e.id,
      newsItemId: e.newsItemId,
      type: "schedule" as const,
      event: e.event,
      status: e.status,
      kind: e.kind,
      scheduleSource: e.scheduleSource,
      errorMessage: e.errorMessage,
      displayTitle: e.newsTitle ?? e.text?.slice(0, 80) ?? `Scheduled ${e.kind ?? "post"}`,
      displayTime: e.createdAt,
    })),
    ...drafts.map((d) => ({
      id: d.id,
      newsItemId: d.newsItemId,
      type: "draft" as const,
      event: d.status, // draft status acts as event
      status: d.status,
      errorMessage: d.errorMessage,
      displayTitle: d.newsTitle ?? `Draft #${d.id}`,
      displayTime: d.createdAt,
    })),
  ].sort((a, b) => new Date(b.displayTime).getTime() - new Date(a.displayTime).getTime());

  // Optional: merge drafts + schedule events by news_item_id
  // Prefers schedule events in final states (published/failed/canceled) over drafts
  if (mergeByStory) {
    const storyMap = new Map<number | string, MergedEvent>();
    for (const e of allEvents) {
      const key = e.newsItemId ?? `${e.type}-${e.id}`;
      const existing = storyMap.get(key);
      
      if (!existing) {
        storyMap.set(key, e);
        continue;
      }

      const existingIsFinalSchedule = existing.type === "schedule" && isFinalScheduleEvent(existing.event);
      const currentIsFinalSchedule = e.type === "schedule" && isFinalScheduleEvent(e.event);

      // Prefer final schedule events over everything
      // If both are final schedule, prefer newer
      // If neither is final schedule, prefer newer by displayTime
      let shouldReplace = false;
      if (currentIsFinalSchedule && !existingIsFinalSchedule) {
        shouldReplace = true;
      } else if (currentIsFinalSchedule && existingIsFinalSchedule) {
        shouldReplace = new Date(e.displayTime) > new Date(existing.displayTime);
      } else if (!currentIsFinalSchedule && !existingIsFinalSchedule) {
        shouldReplace = new Date(e.displayTime) > new Date(existing.displayTime);
      }

      if (shouldReplace) {
        storyMap.set(key, e);
      }
    }
    allEvents = Array.from(storyMap.values())
      .sort((a, b) => new Date(b.displayTime).getTime() - new Date(a.displayTime).getTime());
  }

  return NextResponse.json(allEvents.slice(0, limit), {
    headers: { "cache-control": "no-store" },
  });
}