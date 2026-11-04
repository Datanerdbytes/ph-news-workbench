import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { facebookConfigured } from '@/lib/facebook';

export const dynamic = 'force-dynamic';

type ConnectionRow = {
  page_id: string;
  page_name: string;
  scopes: string | null;
  connected_at: string | Date | null;
};

export async function GET(request: NextRequest) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const rows = (await sql`
    SELECT page_id, page_name, scopes, connected_at
    FROM facebook_connections
    WHERE workspace_id = ${access.workspace.id}
  `) as unknown as ConnectionRow[];

  const row = rows[0];

  return NextResponse.json(
    {
      configured: facebookConfigured(),
      connected: Boolean(row),
      page: row ? { id: row.page_id, name: row.page_name } : null,
      scopes: row?.scopes ? row.scopes.split(',').filter(Boolean) : [],
      connectedAt: row?.connected_at ?? null,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
