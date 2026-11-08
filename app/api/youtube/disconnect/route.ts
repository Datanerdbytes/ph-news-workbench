import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  await sql`
    DELETE FROM youtube_connections
    WHERE workspace_id = ${access.workspace.id}
  `;

  return NextResponse.json({ ok: true });
}
