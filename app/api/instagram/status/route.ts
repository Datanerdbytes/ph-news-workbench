import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { facebookConfigured } from '@/lib/facebook';
import { resolveInstagramAccount } from '@/lib/publishing/instagram';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const configured = facebookConfigured();
  const resolution = await resolveInstagramAccount(access.workspace.id);

  return NextResponse.json(
    {
      configured,
      connected: resolution.ok,
      ig: resolution.ok
        ? {
            id: resolution.account.id,
            username: resolution.account.username,
            picture: resolution.account.picture,
          }
        : null,
      scopes: resolution.ok ? resolution.scopes : [],
      missingScopes:
        !resolution.ok && resolution.reason === 'scope_missing'
          ? (resolution.detail ?? '').split(' + ').filter(Boolean)
          : [],
      reason: resolution.ok ? null : resolution.reason,
      detail: resolution.ok ? null : resolution.detail,
      pageId: resolution.ok ? resolution.pageId : null,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
