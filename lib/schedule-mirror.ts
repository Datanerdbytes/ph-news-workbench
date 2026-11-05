import { sql } from '@/lib/db';
import { recordScheduleEvent } from '@/lib/schedule-events';

/**
 * The kinds of content that Facebook can schedule on our behalf. Each of
 * these is created on Facebook first (with `published=false` +
 * `scheduled_publish_time`, or `planned_start_time` for live) and then
 * mirrored here so the Calendar and Analytics can see it.
 *
 * The Story Queue does NOT use this module — it schedules locally and the
 * worker publishes it, so it writes `source='local'` rows directly.
 */
export type NativeScheduleKind = 'post' | 'photo' | 'video' | 'reel' | 'live';

export type NativePublishResult = {
  page: { id: string; name: string };
  ok: boolean;
  id?: string;
  permalink?: string | null;
  error?: string;
};

export const NATIVE_KIND_LABELS: Record<NativeScheduleKind, string> = {
  post: 'Post',
  photo: 'Photo',
  video: 'Video',
  reel: 'Reel',
  live: 'Live',
};

/** Treat anything within this window as "publish now" rather than scheduled. */
export const IMMEDIATE_PUBLISH_WINDOW_MS = 60_000;

/**
 * Record a Facebook-native publish so the workspace has a local row for it.
 *
 * - A scheduled publish becomes `status='scheduled'` and is later flipped to
 *   `published`/`failed` by the status sweep in lib/schedule-worker.ts, which
 *   asks Facebook whether it went live.
 * - An immediate publish becomes `status='published'` right away, so the
 *   Analytics totals count it.
 * - A publish that Facebook rejected on every Page becomes `status='failed'`
 *   so it is visible in the Calendar instead of vanishing.
 *
 * A recording failure never fails the publish itself: the content is already
 * on Facebook either way.
 */
export async function recordNativeSchedule({
  workspaceId,
  userId,
  kind,
  text,
  scheduledFor,
  results,
  newsItemId = null,
  draftId = null,
}: {
  workspaceId: string;
  userId: string;
  kind: NativeScheduleKind;
  text: string;
  /** The moment Facebook will publish. `null` means it published immediately. */
  scheduledFor: Date | null;
  results: NativePublishResult[];
  newsItemId?: number | null;
  draftId?: number | null;
}): Promise<void> {
  const success = results.find((result) => result.ok);
  const scheduled =
    scheduledFor !== null && scheduledFor.getTime() > Date.now() + IMMEDIATE_PUBLISH_WINDOW_MS;

  const status = !success ? 'failed' : scheduled ? 'scheduled' : 'published';
  const errorMessage = success
    ? null
    : (results.find((result) => result.error)?.error ??
      'Facebook rejected the publish on every selected Page.');

  try {
    const rows = (await sql`
      INSERT INTO scheduled_posts
        (workspace_id, news_item_id, draft_id, text, scheduled_for, status,
         kind, source, facebook_post_id, facebook_post_ids, page_id,
         error_message, created_by)
      VALUES
        (${workspaceId}, ${newsItemId}, ${draftId}, ${text || '(no caption)'},
         ${(scheduledFor ?? new Date()).toISOString()}, ${status},
         ${kind}, 'facebook', ${success?.id ?? null},
         ${JSON.stringify(results)}::jsonb, ${success?.page.id ?? null},
         ${errorMessage}, ${userId})
      RETURNING id`) as unknown as { id: number }[];

    await recordScheduleEvent({
      workspaceId,
      scheduledPostId: rows[0].id,
      newsItemId,
      event: status === 'failed' ? 'failed' : status === 'scheduled' ? 'scheduled' : 'published',
      source: 'composer',
      actorUserId: userId,
      facebookPostId: success?.id ?? null,
      errorMessage,
      metadata: {
        kind,
        executor: 'facebook',
        scheduledFor: scheduledFor?.toISOString() ?? null,
        pages: results.length,
        published: results.filter((result) => result.ok).length,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        route: 'schedule-mirror',
        event: 'record_failed',
        kind,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
