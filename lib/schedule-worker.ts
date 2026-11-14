import { sql } from "@/lib/db";
import {
  FacebookApiError,
  isFacebookLiveStarted,
  isFacebookPostPublished,
  isFacebookStillScheduled,
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
import {
  notifyTokenInvalid,
  notifyWorkspace,
  scheduledOutcomeCopy,
} from "@/lib/notifications";
import { getPrimaryPage, resolvePageToken } from "@/lib/facebook-page-token";
import { resolvePlatformAccount } from "@/lib/publishing/connection";
import {
  ensureFreshYouTubeToken,
  fetchYouTubeVideoStatus,
} from "@/lib/youtube";

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
/** How long after its slot a YouTube-scheduled video may stay private. */
const YOUTUBE_GRACE_MINUTES = 60;

type ClaimedRow = {
  id: number;
  workspace_id: string;
  news_item_id: number | null;
  draft_id: number | null;
  text: string;
  image_url: string | null;
  image_urls: unknown;
  kind: string;
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
              s.image_url, s.image_urls, s.kind, s.attempts`) as unknown as ClaimedRow[];

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
      const primary = await getPrimaryPage(post.workspace_id);
      if (!primary) {
        throw new Error("This workspace has no connected Facebook Page.");
      }

      const storedImages = Array.isArray(post.image_urls)
        ? post.image_urls
        : post.image_url
          ? [post.image_url]
          : [];

      const result = await publishPagePost({
        pageId: primary.pageId,
        accessToken: primary.token,
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

      const successCopy = scheduledOutcomeCopy(post.kind, true, post.text);
      await notifyWorkspace({
        workspaceId: post.workspace_id,
        type: "scheduled_publish_success",
        title: successCopy.title,
        body: successCopy.body,
        link: `/calendar?post=${post.id}`,
      });
      published++;
    } catch (error) {
      const message =
        error instanceof FacebookApiError
          ? redactTokens(error.message)
          : error instanceof Error
            ? error.message
            : "The scheduled post could not be published.";
      const permissionIssue =
        error instanceof FacebookApiError &&
        (error.code === 10 || error.code === 200 || error.code === 190);

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

      if (permissionIssue) {
        await notifyTokenInvalid(post.workspace_id);
      }

      if (exhausted) {
        failed++;
        const failedCopy = scheduledOutcomeCopy(post.kind, false, message);
        await notifyWorkspace({
          workspaceId: post.workspace_id,
          type: "scheduled_publish_failed",
          title: failedCopy.title,
          body: failedCopy.body,
          link: `/calendar?post=${post.id}`,
        });
      }
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
          const recoveredCopy = scheduledOutcomeCopy(row.kind, true);
          await notifyWorkspace({
            workspaceId: row.workspace_id,
            type: "scheduled_publish_success",
            title: recoveredCopy.title,
            body: recoveredCopy.body,
            link: `/calendar?post=${row.id}`,
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

    if (exhausted) {
      const interruptedCopy = scheduledOutcomeCopy(
        row.kind,
        false,
        "The scheduler was interrupted before this post went out."
      );
      await notifyWorkspace({
        workspaceId: row.workspace_id,
        type: "scheduled_publish_failed",
        title: interruptedCopy.title,
        body: interruptedCopy.body,
        link: `/calendar?post=${row.id}`,
      });
    }
  }
}

type NativeRow = {
  id: number;
  workspace_id: string;
  news_item_id: number | null;
  kind: string;
  source: string;
  facebook_post_id: string | null;
  facebook_post_ids: unknown;
  page_id: string | null;
  scheduled_for: Date | string;
};

/**
 * Facebook (and, for videos scheduled with publishAt, YouTube) is the
 * executor for every natively scheduled item, but the workspace still needs
 * to learn how each one ended. This sweep asks the platform whether the item
 * went live and flips the local row to 'published' or 'failed' — so the
 * Calendar and Analytics stay truthful.
 */
export async function syncNativeSchedules(): Promise<number> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
  const rows = (await sql`
    SELECT id, workspace_id, news_item_id, kind, source, facebook_post_id,
           facebook_post_ids, page_id, scheduled_for
    FROM scheduled_posts
    WHERE source IN ('facebook', 'youtube') AND status = 'scheduled'
      AND scheduled_for <= ${oneMinuteAgo}
      AND updated_at < ${twoMinutesAgo}
    ORDER BY scheduled_for ASC
    LIMIT 10
    FOR UPDATE SKIP LOCKED`) as unknown as NativeRow[];

  let synced = 0;

  for (const row of rows) {
    if (row.source === "youtube") {
      // Per-row boundary: a failing terminal write (status flip, event,
      // notification) must not abort the sweep or starve the local claim.
      try {
        synced += await syncYouTubeSchedule(row);
      } catch (error) {
        console.error(
          JSON.stringify({
            route: "schedule-sync",
            event: "failed",
            scheduledPostId: row.id,
            kind: row.kind,
            source: "youtube",
            error: error instanceof Error ? error.message : String(error),
          })
        );
      }
      continue;
    }

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
        const nativeCopy = scheduledOutcomeCopy(row.kind, true);
        await notifyWorkspace({
          workspaceId: row.workspace_id,
          type: "scheduled_publish_success",
          title: nativeCopy.title,
          body: nativeCopy.body,
          link: `/calendar?post=${row.id}`,
        });
        synced++;
        continue;
      }

      if (published === null && row.page_id) {
        // Reel and video container nodes cannot be read at all (bare GETs are
        // refused with code 12), so the probes above stay "unknown" for them.
        // Ask Facebook's own queue instead: once the item leaves
        // /{page}/scheduled_posts, Facebook has released it — past the slot
        // that means it went out, before the slot that it was removed there.
        const held = await isFacebookStillScheduled(
          row.page_id,
          postId,
          token
        );
        if (held === false) {
          const pastSlot =
            Date.now() >= new Date(row.scheduled_for).getTime();
          if (pastSlot) {
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
              metadata: { kind: row.kind, executor: "facebook", viaQueue: true },
            });
            const queueCopy = scheduledOutcomeCopy(row.kind, true);
            await notifyWorkspace({
              workspaceId: row.workspace_id,
              type: "scheduled_publish_success",
              title: queueCopy.title,
              body: queueCopy.body,
              link: `/calendar?post=${row.id}`,
            });
          } else {
            await markNativeFailed(
              row,
              "The item was removed from Facebook before its scheduled time."
            );
          }
          synced++;
          continue;
        }
        // held === true (still queued) or null (edge unreadable) — fall
        // through to the grace check below.
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

/**
 * YouTube is the executor for videos uploaded with `status.publishAt` — it
 * keeps them Private until the slot, then flips them public. The probe reads
 * exactly that flag; still private well past the slot means the video never
 * went out (processing failure, removed in Studio) and is surfaced as failed.
 * Inconclusive probes (non-OK or malformed responses) stay retryable — they
 * must never record a failure, because the video may already be public.
 */
async function syncYouTubeSchedule(row: NativeRow): Promise<number> {
  const videoId = row.facebook_post_id;
  if (!videoId) {
    await markNativeFailed(row, "YouTube did not return an id for this upload.");
    return 1;
  }

  const overdueBy = Date.now() - new Date(row.scheduled_for).getTime();

  let connection;
  try {
    connection = await resolvePlatformAccount(row.workspace_id, "youtube");
  } catch (error) {
    return backOffYouTubeProbe(row, error, overdueBy);
  }
  if (!connection) {
    await markNativeFailed(row, "The YouTube connection is gone. Reconnect YouTube.");
    return 1;
  }

  let token: string;
  let status: Awaited<ReturnType<typeof fetchYouTubeVideoStatus>>;
  try {
    token = await ensureFreshYouTubeToken(connection, row.workspace_id);
    status = await fetchYouTubeVideoStatus(videoId, token);
  } catch (error) {
    return backOffYouTubeProbe(row, error, overdueBy);
  }

  if (status.privacyStatus === "public") {
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
      facebookPostId: videoId,
      metadata: { kind: row.kind, executor: "youtube" },
    });
    const youtubeCopy = scheduledOutcomeCopy(row.kind, true);
    await notifyWorkspace({
      workspaceId: row.workspace_id,
      type: "scheduled_publish_success",
      title: youtubeCopy.title,
      body: youtubeCopy.body,
      link: `/calendar?post=${row.id}`,
    });
    return 1;
  }

  if (status.privacyStatus === null) {
    // Non-OK or malformed response — the answer is unknown, and the video
    // may already be public. An inconclusive probe never records a failure:
    // back off and retry on a later sweep.
    await bumpYouTubeRetryMarker(row);
    console.error(
      JSON.stringify({
        route: "schedule-sync",
        event: "probe_failed",
        scheduledPostId: row.id,
        kind: row.kind,
        source: "youtube",
        error: "inconclusive probe response",
      })
    );
    return 0;
  }

  // Confirmed still non-public. Past the grace window YouTube is not going
  // to publish it — surface that instead of leaving it queued forever.
  if (overdueBy > YOUTUBE_GRACE_MINUTES * 60_000) {
    await markNativeFailed(
      row,
      "YouTube did not publish this video at its scheduled time."
    );
    return 1;
  }
  return 0;
}

/**
 * A YouTube probe failed transiently (token refresh, network). Bump
 * `updated_at` so the row skips the sweep's 2-minute staleness gate —
 * otherwise the same row would occupy the sweep's LIMIT 10 slot every run
 * and starve the rows behind it. The bump is best-effort: a failed marker
 * must not abort the rest of the sweep. Only `scheduled` native rows read
 * `updated_at` this way (the publish claim filters `source='local'`), so
 * publish timing is unaffected.
 */
async function backOffYouTubeProbe(
  row: NativeRow,
  error: unknown,
  overdueBy: number
): Promise<number> {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  console.error(
    JSON.stringify({
      route: "schedule-sync",
      event: "probe_failed",
      scheduledPostId: row.id,
      kind: row.kind,
      source: "youtube",
      error: message,
    })
  );

  // Broken well past the slot, sweep after sweep — surface it rather than
  // leave the row queued forever with a connection that never answers.
  if (overdueBy > YOUTUBE_GRACE_MINUTES * 60_000) {
    await markNativeFailed(row, `YouTube could not be probed: ${message}`);
    return 1;
  }

  await bumpYouTubeRetryMarker(row);
  return 0;
}

/** Best-effort retry marker — see backOffYouTubeProbe. */
async function bumpYouTubeRetryMarker(row: NativeRow): Promise<void> {
  try {
    await sql`
      UPDATE scheduled_posts
      SET updated_at = now()
      WHERE id = ${row.id} AND status = 'scheduled'`;
  } catch {
    // The marker only delays the next probe; never fail the sweep for it.
  }
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
    metadata: { kind: row.kind, executor: row.source },
  });
  const failedCopy = scheduledOutcomeCopy(row.kind, false, reason);
  await notifyWorkspace({
    workspaceId: row.workspace_id,
    type: "scheduled_publish_failed",
    title: failedCopy.title,
    body: failedCopy.body,
    link: `/calendar?post=${row.id}`,
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
