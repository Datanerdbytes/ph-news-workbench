import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

type TotalsRow = {
  drafts: number;
  published: number;
  scheduled: number;
  scheduled_published: number;
  failed: number;
  tokens: number;
  cost: number;
};

type DailyRow = {
  day: string;
  drafts: number;
  published: number;
  scheduled: number;
};

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();
  const workspaceId = access.workspace.id;

  const totals = (await sql`
    SELECT
      (SELECT count(*)::int FROM drafts
        WHERE workspace_id = ${workspaceId}) AS drafts,
      (SELECT count(*)::int FROM drafts
        WHERE workspace_id = ${workspaceId} AND status = 'published') AS published,
      (SELECT count(*)::int FROM scheduled_posts
        WHERE workspace_id = ${workspaceId} AND status = 'scheduled') AS scheduled,
      (SELECT count(*)::int FROM scheduled_posts
        WHERE workspace_id = ${workspaceId} AND status = 'published') AS scheduled_published,
      (SELECT count(*)::int FROM scheduled_posts
        WHERE workspace_id = ${workspaceId} AND status = 'failed') AS failed,
      (SELECT coalesce(sum(input_tokens + output_tokens), 0)::int FROM drafts
        WHERE workspace_id = ${workspaceId}) AS tokens,
      (SELECT coalesce(sum(estimated_cost), 0)::float8 FROM drafts
        WHERE workspace_id = ${workspaceId}) AS cost
  `) as unknown as TotalsRow[];

  const daily = (await sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day,
           sum(drafts)::int AS drafts,
           sum(published)::int AS published,
           sum(scheduled)::int AS scheduled
    FROM (
      SELECT date_trunc('day', created_at)::date AS day,
             count(*) AS drafts, 0 AS published, 0 AS scheduled
      FROM drafts
      WHERE workspace_id = ${workspaceId}
        AND created_at >= now() - interval '14 days'
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('day', created_at)::date,
             0, count(*), 0
      FROM drafts
      WHERE workspace_id = ${workspaceId}
        AND status = 'published'
        AND created_at >= now() - interval '14 days'
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('day', scheduled_for)::date,
             0, 0, count(*)
      FROM scheduled_posts
      WHERE workspace_id = ${workspaceId}
        AND status = 'scheduled'
        AND scheduled_for >= now() - interval '14 days'
      GROUP BY 1
    ) buckets
    GROUP BY day
    ORDER BY day
  `) as unknown as DailyRow[];

  const row = totals[0];

  return NextResponse.json(
    {
      totals: {
        drafts: row?.drafts ?? 0,
        published: (row?.published ?? 0) + (row?.scheduled_published ?? 0),
        scheduled: row?.scheduled ?? 0,
        failed: row?.failed ?? 0,
        tokens: row?.tokens ?? 0,
        cost: row?.cost ?? 0,
      },
      daily,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
