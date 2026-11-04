import { NextResponse } from 'next/server';
import { listManagedPages } from '@/lib/publishing/connection';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  try {
    const pages = await listManagedPages(access.workspace.id);
    return NextResponse.json(
      { pages },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Could not load the managed Pages.', pages: [] },
      { status: 500 }
    );
  }
}
