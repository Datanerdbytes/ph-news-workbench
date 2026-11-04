import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { sql } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/session';
import { isCronRequest } from '@/lib/cron';
import crypto from 'crypto';
import { randomUUID } from 'crypto';

const parser = new Parser();
const FEEDS = [
  'https://www.inquirer.net/fullfeed',
  'https://www.rappler.com/feed/',
  'https://www.philstar.com/rss/headlines',
];

export async function POST(request: Request) {
  if (!isCronRequest(request) && !(await requireUser(request))) {
    return unauthorized();
  }
  const correlationId = randomUUID();
  let ingested = 0;
  let skipped = 0;
  console.log(JSON.stringify({ route: 'ingest', correlationId, event: 'start', feeds: FEEDS.length }));
  for (const url of FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      const feedRow = await sql`INSERT INTO feeds (url) VALUES (${url}) ON CONFLICT (url) DO UPDATE SET url=EXCLUDED.url RETURNING id`;
      const feedId = feedRow[0].id;
      for (const item of feed.items ?? []) {
        const link = item.link ?? '';
        const title = item.title ?? '';
        const guid = item.guid ?? link;
        const dedupHash = crypto.createHash('sha256').update(`${link}|${title}`).digest('hex');
        const res = await sql`
          INSERT INTO news_items (feed_id, guid, link, title, summary, published_at, raw_payload, dedup_hash)
          VALUES (${feedId}, ${guid}, ${link}, ${title}, ${item.contentSnippet ?? ''}, ${item.pubDate ? new Date(item.pubDate) : null}, ${JSON.stringify(item)}, ${dedupHash})
          ON CONFLICT (feed_id, dedup_hash) DO NOTHING
          RETURNING id`;
        if (res.length) ingested++; else skipped++;
      }
      await sql`UPDATE feeds SET last_fetched_at = now() WHERE id = ${feedId}`;
      console.log(JSON.stringify({ route: 'ingest', correlationId, event: 'feed_ok', url, ingested, skipped }));
    } catch (e) {
      console.error(JSON.stringify({ route: 'ingest', correlationId, event: 'feed_error', url, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  console.log(JSON.stringify({ route: 'ingest', correlationId, event: 'done', ingested, skipped }));
  return NextResponse.json({ ingested, skipped, correlationId });
}
