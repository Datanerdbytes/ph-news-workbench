import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { googleConfigured } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

type ConnectionRow = {
  youtube_user_id: string;
  username: string;
  scopes: string | null;
  expires_at: Date | string | null;
  refresh_token: string | null;
  connected_at: string | Date | null;
};

export async function GET(request: NextRequest) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const rows = (await sql`
    SELECT youtube_user_id, username, scopes, expires_at, refresh_token, connected_at
    FROM youtube_connections
    WHERE workspace_id = ${access.workspace.id}
  `) as unknown as ConnectionRow[];

  const row = rows[0];

  return NextResponse.json(
    {
      configured: googleConfigured(),
      connected: Boolean(row),
      account: row
        ? { id: row.youtube_user_id, name: row.username }
        : null,
      scopes: row?.scopes ? row.scopes.split(',').filter(Boolean) : [],
      hasRefresh: Boolean(row?.refresh_token),
      tokenExpiresAt: row?.expires_at ?? null,
      connectedAt: row?.connected_at ?? null,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
