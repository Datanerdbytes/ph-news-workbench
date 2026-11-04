import { sql } from "@/lib/db";
import { decryptToken } from "@/lib/facebook-token";
import {
  FacebookApiError,
  parseImages,
  publishPagePost,
  redactTokens,
} from "@/lib/facebook";
import { stripMarkdown } from "@/lib/format";
import {
  recordScheduleEvent,
  type ScheduleEventSource,
} from "@/lib/schedule-events";

type ClaimedRow = {
  id: number;
  workspace_id: string;
  news_item_id: number | null;
  draft_id: number | null;
  text: string;
  image_url: string | null;
  image_urls: unknown;
};

type ConnectionRow = {
  page_id: string;
  access_token: string;
};

export type ScheduleRunResult = {
  due: number;
  published: number;
  failed: number;
};

export type ScheduleRunOptions = {
  source: ScheduleEventSource;
  actorUserId?: string | null;
};

export async function publishDuePosts(
  options: ScheduleRunOptions = { source: "scheduler" }
): Promise<ScheduleRunResult> {
  const due = (await sql`
    WITH due AS (
      SELECT id FROM scheduled_posts
      WHERE status = 'scheduled' AND scheduled_for <= now()
      ORDER BY scheduled_for ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    )
    UPDATE scheduled_posts s
    SET status = 'publishing', updated_at = now()
    FROM due
    WHERE s.id = due.id
    RETURNING s.id, s.workspace_id, s.news_item_id, s.draft_id, s.text, s.image_url, s.image_urls`) as unknown as ClaimedRow[];

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
      const connections = (await sql`
        SELECT page_id, access_token FROM facebook_connections
        WHERE workspace_id = ${post.workspace_id}`) as unknown as ConnectionRow[];

      const connection = connections[0];
      if (!connection) {
        throw new Error("This workspace has no connected Facebook Page.");
      }

      const storedImages = Array.isArray(post.image_urls)
        ? post.image_urls
        : post.image_url
          ? [post.image_url]
          : [];

      const result = await publishPagePost({
        pageId: connection.page_id,
        accessToken: decryptToken(connection.access_token),
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

      await sql`
        UPDATE scheduled_posts
        SET status = 'failed', error_message = ${message}, updated_at = now()
        WHERE id = ${post.id}`;

      await recordScheduleEvent({
        workspaceId: post.workspace_id,
        scheduledPostId: post.id,
        newsItemId: post.news_item_id,
        event: "failed",
        source: options.source,
        actorUserId: options.actorUserId,
        errorMessage: message,
      });
      failed++;
    }
  }

  return { due: due.length, published, failed };
}
