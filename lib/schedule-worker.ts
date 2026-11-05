import { sql } from "@/lib/db";
import {
  FacebookApiError,
  isFacebookLiveStarted,
  isFacebookPostPublished,
  isFacebookVideoPublished,
  parseImages,
  publishPagePost,
  redactTokens,
} from "@/lib/facebook";
import { stripMarkdown } from "@/lib/format";
import {
  recordScheduleEvent,
  type ScheduleEventSource,
} from "@/lib/schedule-events";
import { resolvePageToken } from "@/lib/facebook-page-token";

/** How many times the local executor will try a post before giving up. */
const MAX_ATTEMPTS = 3;
/** Wait this long between retries of a failed local publish. */
const RETRY_BACKOFF_MINUTES = 2;
/** A post stuck in 'publishing' this long is assumed to have been orphaned. */
const STUCK_PUBLISHING_MINUTES = 5;
/** How long after its slot a Facebook-native item may stay unpublished. */
const NATIVE_GRACE_MINUTES: Record<string, number> = {
  post: 60,
  photo: 60,
  reel: 60,
  live: 120,
  // Long videos need time to finish processing before they can go live.
  video: 60,
};

type ClaimedRow = {
  id: number;
  workspace_id: string;
  news_item_id: number | null;
  draft_id: number | null;
  text: string;
  image_url: string | null;
  image_urls: unknown;
  attempts: number;
};

export type ScheduleRunResult = {
  due: number;
  published: number;
  failed: number;
  synced: number;
};

export type ScheduleRunOptions = {
  source: ScheduleEventSource;
  actorUserId?: string | null;
};

export async function publishDuePosts(
  options: ScheduleRunOptions = { source: "scheduler" }
): Promise<ScheduleRunResult> {
  const synced = await syncNativeSchedules();
  await requeueStuckPosts();

  const due = (await sql`
    WITH due AS (
      SELECT id FROM scheduled_posts
      WHERE status = 'scheduled' AND scheduled_for <= now()
        AND source = 'local'
        AND attempts < ${MAX_ATTEMPTS}
        AND (attempts = 0
             OR updated_at < now() - (${RETRY_BACKOFF_MINUTES} * interval '1 minute'))
      ORDER BY scheduled_for ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    )
    UPDATE scheduled_posts s
    SET status = 'publishing', attempts = s.attempts + 1, updated_at = now()
    FROM due
    WHERE s.id = due.id
    RETURNING s.id, s.workspace_id, s.news_item_id, s.draft_id, s.text,
              s.image_url, s.image_urls, s.attempts`) as unknown as ClaimedRow[];

  let published = 0;
  let failed = 0;

  for (const post of due) {
    await recordScheduleEvent({
      workspaceId: post.workspace_id,
      scheduledPostId: post.id,
      newsItemId: post.news_item_id,
      event: "claimed",
      source: options.source,
      actorUserId: options.actorUserId,
    });

    try {
      const token = await resolvePageToken(post.workspace_id, null);
      if (!token) {
        throw new Error("This workspace has no connected Facebook Page.");
      }

      const storedImages = Array.isArray(post.image_urls)
        ? post.image_urls
        : post.image_url
          ? [post.image_url]
          : [];

      const result = await publishPagePost({
        pageId: token, // resolvePageToken returns the token directly, not a page object
        accessToken: token,
        message: stripMarkdown(post.text),
        images: parseImages(storedImages),
      });

      await sql`
        UPDATE scheduled_posts
        SET status = 'published', facebook_post_id = ${result.id},
            error_message = NULL, updated_at = now()
        WHERE id = ${post.id}`;

      if (post.draft_id) {
        await sql`UPDATE drafts SET status = 'published' WHERE id = ${post.draft_id}`;
      }

      await recordScheduleEvent({
        workspaceId: post.workspace_id,
        scheduledPostId: post.id,
        newsItemId: post.news_item_id,
        event: "published",
        source: options.source,
        actorUserId: options.actorUserId,
        facebookPostId: result.id,
      });
      published++;
    } catch (error) {
      const message =
        error instanceof FacebookApiError
          ? redactTokens(error.message)
          : error instanceof Error
            ? error.message
            : "The scheduled post could not be published.";

      // A transient Facebook failure should not kill the scheduled post. Keep
      // it queued until the attempt budget runs out.
      const exhausted = post.attempts >= MAX_ATTEMPTS;

      await sql`
        UPDATE scheduled_posts
        SET status = ${exhausted ? "failed" : "scheduled"},
            error_message = ${message}, updated_at = now()
        WHERE id = ${post.id}`;

      await recordScheduleEvent({
        workspaceId: post.workspace_id,
        scheduledPostId: post.id,
        newsItemId: post.news_item_id,
        event: exhausted ? "failed" : "retrying",
        source: options.source,
        actorUserId: options.actorUserId,
        errorMessage: message,
        metadata: { attempt: post.attempts, maxAttempts: MAX_ATTEMPTS },
      });

      if (exhausted) failed++;
    }
  }

  return { due: due.length, published, failed, synced };
}

/**
 * Recover posts the executor claimed but never finished — a crash or a
 * restart between the claim and the publish leaves them stuck in
 * 'publishing' forever, because only 'scheduled' rows are claimed.
 */
async function requeueStuckPosts(): Promise<void> {
  const rows = (await sql`
    SELECT id, workspace_id, news_item_id, attempts, facebook_post_id, kind
    FROM scheduled_posts
    WHERE status = 'publishing'
      AND updated_at < now() - (${STUCK_PUBLISHING_MINUTES} * interval '1 minute')
    LIMIT 10
    FOR UPDATE SKIP LOCKED`) as unknown as {
    id: number;
    workspace_id: string;
    news_item_id: number | null;
    attempts: number;
    facebook_post_id: string | null;
    kind: string;
  }[];

  for (const row of rows) {
    // First check if Facebook actually published it
    if (row.facebook_post_id) {
      const token = await resolvePageToken(row.workspace_id, null);
      if (token) {
        const published = await detectPublished(row.kind, row.facebook_post_id, token);
        if (published === true) {
          // Facebook did publish it — mark as published locally
          await sql`
            UPDATE scheduled_posts
            SET status = 'published', error_message = NULL, updated_at = now()
            WHERE id = ${row.id} AND status = 'publishing'`;
          await recordScheduleEvent({
            workspaceId: row.workspace_id,
            scheduledPostId: row.id,
            newsItemId: row.news_item_id,
            event: "published",
            source: "scheduler",
            facebookPostId: row.facebook_post_id,
            metadata: { kind: row.kind, executor: "facebook", recovered: true },
          });
          continue;
        }
      }
    }

    // Not published on Facebook — requeue or fail
    const exhausted = row.attempts >= MAX_ATTEMPTS;
    const newStatus = exhausted ? "failed" : "scheduled";

    await sql`
      UPDATE scheduled_posts
      SET status = ${newStatus},
          error_message = 'The scheduler was interrupted before this post went out.',
          updated_at = now()
      WHERE id = ${row.id} AND status = 'publishing'`;

    await recordScheduleEvent({
      workspaceId: row.workspace_id,
      scheduledPostId: row.id,
      newsItemId: row.news_item_id,
      event: exhausted ? "failed" : "retrying",
      source: "scheduler",
      errorMessage:
        "The scheduler was interrupted before this post went out.",
      metadata: { attempt: row.attempts, maxAttempts: MAX_ATTEMPTS },
    });
  }
}

type NativeRow = {
  id: number;
  workspace_id: string;
  news_item_id: number | null;
  kind: string;
  facebook_post_id: string | null;
  facebook_post_ids: unknown;
  page_id: string | null;
  scheduled_for: Date | string;
};

/**
 * Facebook is the executor for every natively scheduled item, but the
 * workspace still needs to learn how each one ended. This sweep asks Facebook
 * whether the item went live and flips the local row to 'published' or
 * 'failed' — so the Calendar and Analytics stay truthful.
 */
export async function syncNativeSchedules(): Promise<number> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
  const rows = (await sql`
    SELECT id, workspace_id, news_item_id, kind, facebook_post_id,
           facebook_post_ids, page_id, scheduled_for
    FROM scheduled_posts
    WHERE source = 'facebook' AND status = 'scheduled'
      AND scheduled_for <= ${oneMinuteAgo}
      AND updated_at < ${twoMinutesAgo}
    ORDER BY scheduled_for ASC
    LIMIT 10
    FOR UPDATE SKIP LOCKED`) as unknown as NativeRow[];

  let synced = 0;

  for (const row of rows) {
    const postId = row.facebook_post_id;
    if (!postId) {
      await markNativeFailed(row, "Facebook did not return an id for this item.");
      continue;
    }

    try {
      const token = await resolvePageToken(row.workspace_id, row.page_id);
      if (!token) continue;

      const published = await detectPublished(row.kind, postId, token);

      if (published === true) {
        await sql`
          UPDATE scheduled_posts
          SET status = 'published', error_message = NULL, updated_at = now()
          WHERE id = ${row.id} AND status = 'scheduled'`;
        await recordScheduleEvent({
          workspaceId: row.workspace_id,
          scheduledPostId: row.id,
          newsItemId: row.news_item_id,
          event: "published",
          source: "scheduler",
          facebookPostId: postId,
          metadata: { kind: row.kind, executor: "facebook" },
        });
        synced++;
        continue;
      }

      // Still unpublished. If it is well past its slot, Facebook is not going
      // to publish it — surface that instead of leaving it queued forever.
      const graceMinutes = NATIVE_GRACE_MINUTES[row.kind] ?? 60;
      const slot = new Date(row.scheduled_for).getTime();
      const overdueBy = Date.now() - slot;
      if (overdueBy > graceMinutes * 60_000) {
        await markNativeFailed(
          row,
          "Facebook did not publish this item at its scheduled time."
        );
        synced++;
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          route: "schedule-sync",
          event: "failed",
          scheduledPostId: row.id,
          kind: row.kind,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  return synced;
}

async function markNativeFailed(row: NativeRow, reason: string) {
  await sql`
    UPDATE scheduled_posts
    SET status = 'failed', error_message = ${reason}, updated_at = now()
    WHERE id = ${row.id} AND status = 'scheduled'`;
  await recordScheduleEvent({
    workspaceId: row.workspace_id,
    scheduledPostId: row.id,
    newsItemId: row.news_item_id,
    event: "failed",
    source: "scheduler",
    facebookPostId: row.facebook_post_id,
    errorMessage: reason,
    metadata: { kind: row.kind, executor: "facebook" },
  });
}

/**
 * Whether a scheduled item is live. Each kind of item lives on a different
 * kind of Graph node, so try the matching shape first and fall back to the
 * others rather than reporting "unknown" when a node exposes a different
 * field set than expected.
 */
async function detectPublished(
  kind: string,
  id: string,
  token: string
): Promise<boolean | null> {
  const attempts: Array<() => Promise<boolean | null>> =
    kind === "reel" || kind === "video"
      ? [
          () => isFacebookVideoPublished(id, token),
          () => isFacebookPostPublished(id, token),
        ]
      : kind === "live"
        ? [
            () => isFacebookLiveStarted(id, token),
            // Fallback: some live videos appear as video posts after ending
            () => isFacebookVideoPublished(id, token),
            () => isFacebookPostPublished(id, token),
          ]
        : [
            () => isFacebookPostPublished(id, token),
            () => isFacebookVideoPublished(id, token),
          ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result !== null) return result;
    } catch {
      // Try the next shape.
    }
  }

  return null;
}
