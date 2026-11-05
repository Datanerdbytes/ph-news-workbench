import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/session';
import { isCronRequest } from '@/lib/cron';
import { ingestFeed } from '@/lib/feeds';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  if (!isCronRequest(request) && !(await requireUser(request))) {
    return unauthorized();
  }

  const correlationId = randomUUID();
  let totalIngested = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  console.log(JSON.stringify({ route: 'ingest', correlationId, event: 'start' }));

  try {
    // Get all workspaces that have enabled feeds
    const workspacesWithFeeds = await sql`
      SELECT DISTINCT f.workspace_id
      FROM feeds f
      WHERE f.enabled = true
    `;

    console.log(JSON.stringify({
      route: 'ingest',
      correlationId,
      event: 'workspaces_found',
      count: workspacesWithFeeds.length,
    }));

    // Process each workspace's feeds
    for (const ws of workspacesWithFeeds) {
      const workspaceId = ws.workspace_id;
      let workspaceIngested = 0;
      let workspaceSkipped = 0;
      let workspaceErrors = 0;

      // Get enabled feeds for this workspace
      const feeds = await sql`
        SELECT id, url, title
        FROM feeds
        WHERE workspace_id = ${workspaceId} AND enabled = true
        ORDER BY id
      `;

      console.log(JSON.stringify({
        route: 'ingest',
        correlationId,
        event: 'workspace_start',
        workspaceId,
        feedCount: feeds.length,
      }));

      // Process feeds sequentially per workspace to respect rate limits
      for (const feed of feeds) {
        try {
          const { ingested: feedIngested, skipped: feedSkipped } = await ingestFeed(
            { id: feed.id, workspace_id: workspaceId, url: feed.url, title: feed.title },
            { correlationId, trigger: 'cron' },
          );

          workspaceIngested += feedIngested;
          workspaceSkipped += feedSkipped;
        } catch {
          // ingestFeed already recorded the error on the feed row and logged it
          workspaceErrors++;
        }
      }

      totalIngested += workspaceIngested;
      totalSkipped += workspaceSkipped;
      totalErrors += workspaceErrors;

      console.log(JSON.stringify({
        route: 'ingest',
        correlationId,
        event: 'workspace_done',
        workspaceId,
        ingested: workspaceIngested,
        skipped: workspaceSkipped,
        errors: workspaceErrors,
      }));
    }

    console.log(JSON.stringify({
      route: 'ingest',
      correlationId,
      event: 'done',
      ingested: totalIngested,
      skipped: totalSkipped,
      errors: totalErrors,
    }));

    return NextResponse.json({
      ingested: totalIngested,
      skipped: totalSkipped,
      errors: totalErrors,
      correlationId,
    });
  } catch (error) {
    console.error(JSON.stringify({
      route: 'ingest',
      correlationId,
      event: 'fatal_error',
      error: error instanceof Error ? error.message : String(error),
    }));

    return NextResponse.json({
      error: 'Ingestion failed',
      ingested: totalIngested,
      skipped: totalSkipped,
      errors: totalErrors + 1,
      correlationId,
    }, { status: 500 });
  }
}
