import { NextResponse } from 'next/server';
import {
  fetchPageActivity,
  fetchPageAudience,
  redactTokens,
} from '@/lib/facebook';
import { decryptToken } from '@/lib/facebook-token';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

type ConnectionRow = {
  page_id: string;
  page_name: string;
  access_token: string;
};

const NO_STORE = { 'cache-control': 'no-store' } as const;

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const rows = (await sql`
    SELECT page_id, page_name, access_token
    FROM facebook_connections
    WHERE workspace_id = ${access.workspace.id}
    LIMIT 1`) as unknown as ConnectionRow[];

  const connection = rows[0];
  if (!connection) {
    return NextResponse.json({ connected: false }, { headers: NO_STORE });
  }

  try {
    const token = decryptToken(connection.access_token);
    const [audience, activity] = await Promise.all([
      fetchPageAudience(connection.page_id, token),
      fetchPageActivity(connection.page_id, token),
    ]);

    return NextResponse.json(
      {
        connected: true,
        available: true,
        pageName: audience.pageName,
        fans: audience.fans,
        followers: audience.followers,
        engagements7d: activity.engagements7d,
        mediaViews7d: activity.mediaViews7d,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    const reason =
      error instanceof Error
        ? redactTokens(error.message)
        : 'Facebook insights are unavailable.';

    return NextResponse.json(
      {
        connected: true,
        available: false,
        pageName: connection.page_name,
        reason,
      },
      { headers: NO_STORE }
    );
  }
}
