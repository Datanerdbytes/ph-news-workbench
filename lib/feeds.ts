import Parser from 'rss-parser';
import crypto from 'crypto';
import { sql } from '@/lib/db';

export const feedParser = new Parser();

export type IngestableFeed = {
  id: number;
  workspace_id: string;
  url: string;
  title: string | null;
};

/**
 * Fetch one feed and insert its new items. Updates the feed row with the
 * fetched-at timestamp and clears or sets error_message, then rethrows on
 * failure so callers can decide how to surface it.
 */
export async function ingestFeed(
  feed: IngestableFeed,
  opts: { correlationId: string; trigger: 'cron' | 'manual' | 'initial' }
): Promise<{ ingested: number; skipped: number }> {
  const { correlationId, trigger } = opts;

  try {
    const parsedFeed = await feedParser.parseURL(feed.url);

    // Update feed title if we got a better one
    if (parsedFeed.title && parsedFeed.title.trim() && parsedFeed.title.trim() !== feed.title) {
      await sql`UPDATE feeds SET title = ${parsedFeed.title.trim()} WHERE id = ${feed.id}`;
    }

    let ingested = 0;
    let skipped = 0;

    for (const item of parsedFeed.items ?? []) {
      const link = item.link ?? '';
      const title = item.title ?? '';
      const guid = item.guid ?? link;
      const dedupHash = crypto.createHash('sha256').update(`${link}|${title}`).digest('hex');

      const res = await sql`
        INSERT INTO news_items (feed_id, workspace_id, guid, link, title, summary, published_at, raw_payload, dedup_hash)
        VALUES (${feed.id}, ${feed.workspace_id}, ${guid}, ${link}, ${title}, ${item.contentSnippet ?? ''}, ${item.pubDate ? new Date(item.pubDate) : null}, ${JSON.stringify(item)}, ${dedupHash})
        ON CONFLICT (workspace_id, dedup_hash) DO NOTHING
        RETURNING id
      `;

      if (res.length) ingested++; else skipped++;
    }

    await sql`
      UPDATE feeds
      SET last_fetched_at = now(),
          error_message = NULL
      WHERE id = ${feed.id}
    `;

    console.log(JSON.stringify({
      route: 'ingest',
      correlationId,
      trigger,
      event: 'feed_ok',
      workspaceId: feed.workspace_id,
      feedId: feed.id,
      url: feed.url,
      ingested,
      skipped,
    }));

    return { ingested, skipped };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await sql`
      UPDATE feeds
      SET error_message = ${errorMessage},
          last_fetched_at = now()
      WHERE id = ${feed.id}
    `;

    console.error(JSON.stringify({
      route: 'ingest',
      correlationId,
      trigger,
      event: 'feed_error',
      workspaceId: feed.workspace_id,
      feedId: feed.id,
      url: feed.url,
      error: errorMessage,
    }));

    throw error;
  }
}
