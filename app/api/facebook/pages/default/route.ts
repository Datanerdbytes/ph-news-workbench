import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Set the workspace's default publishing page. The `is_primary` flag already
 * drives the pre-selected page in every composer, so "default" and "primary"
 * are the same setting — composers still publish to exactly one page.
 */
export async function PATCH(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    pageId?: string;
  } | null;
  const pageId = typeof body?.pageId === 'string' ? body.pageId : null;
  if (!pageId) {
    return NextResponse.json({ error: 'Choose a Page.' }, { status: 400 });
  }

  const rows = (await sql`
    SELECT page_id
    FROM facebook_pages
    WHERE workspace_id = ${access.workspace.id} AND page_id = ${pageId}
  `) as unknown as { page_id: string }[];
  if (!rows.length) {
    return NextResponse.json(
      { error: 'That Page is not connected to this workspace.' },
      { status: 404 }
    );
  }

  await sql`
    UPDATE facebook_pages
    SET is_primary = (page_id = ${pageId}), updated_at = now()
    WHERE workspace_id = ${access.workspace.id}
  `;

  return NextResponse.json({ ok: true });
}
