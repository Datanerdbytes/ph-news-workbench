import { sql } from "@/lib/db";

export type ScheduleEvent =
  | "scheduled"
  | "canceled"
  | "claimed"
  | "published"
  | "failed";

export type ScheduleEventSource =
  | "composer"
  | "calendar"
  | "scheduler"
  | "manual"
  | "cron";

type RecordEventInput = {
  workspaceId: string;
  scheduledPostId: number;
  newsItemId?: number | null;
  event: ScheduleEvent;
  source: ScheduleEventSource;
  actorUserId?: string | null;
  facebookPostId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordScheduleEvent(input: RecordEventInput) {
  try {
    await sql`
      INSERT INTO scheduled_post_events
        (workspace_id, scheduled_post_id, news_item_id, event, source,
         actor_user_id, facebook_post_id, error_message, metadata)
      VALUES
        (${input.workspaceId}, ${input.scheduledPostId},
         ${input.newsItemId ?? null}, ${input.event}, ${input.source},
         ${input.actorUserId ?? null}, ${input.facebookPostId ?? null},
         ${input.errorMessage ?? null},
         ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb)`;
  } catch (error) {
    console.error(
      JSON.stringify({
        route: "schedule-events",
        event: "failed",
        scheduledPostId: input.scheduledPostId,
        scheduleEvent: input.event,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
