import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { decryptToken } from '@/lib/facebook-token';
import { requireWorkspace, unauthorized } from '@/lib/session';

type ConnectionRow = {
  page_id: string;
  page_name: string;
  access_token: string;
  scopes: string | null;
};

type ManagedPageRow = {
  page_id: string;
  page_name: string;
  access_token: string;
  is_primary: boolean;
};

export type PublishingConnection = {
  pageId: string;
  pageName: string;
  accessToken: string;
  scopes: string[];
};

export type PageTarget = {
  id: string;
  name: string;
  accessToken: string;
};

type WorkspaceAccess = NonNullable<
  Awaited<ReturnType<typeof requireWorkspace>>
>;

export type PublishingContext = {
  access: WorkspaceAccess;
  connection: PublishingConnection;
};

export type PublishingContextResult =
  | { context: PublishingContext; response?: never }
  | { context?: never; response: NextResponse };

export async function requirePublishingConnection(
  request: Request,
  action: string
): Promise<PublishingContextResult> {
  const access = await requireWorkspace(request);
  if (!access) return { response: unauthorized() };

  let rows: ConnectionRow[];
  try {
    rows = (await sql`
      SELECT page_id, page_name, access_token, scopes
      FROM facebook_connections
      WHERE workspace_id = ${access.workspace.id}
    `) as unknown as ConnectionRow[];
  } catch {
    return {
      response: NextResponse.json(
        {
          error: 'Could not read the Facebook connection.',
          code: 'connection_failed',
        },
        { status: 500 }
      ),
    };
  }

  const row = rows[0];
  if (!row) {
    return {
      response: NextResponse.json(
        {
          error: `Connect your Facebook Page before ${action}.`,
          code: 'not_connected',
        },
        { status: 409 }
      ),
    };
  }

  const scopes = (row.scopes ?? '').split(',').filter(Boolean);
  if (!scopes.includes('pages_manage_posts')) {
    return {
      response: NextResponse.json(
        {
          error: `This connection cannot ${action}. Reconnect the Page to grant pages_manage_posts.`,
          code: 'scope_missing',
        },
        { status: 403 }
      ),
    };
  }

  try {
    return {
      context: {
        access,
        connection: {
          pageId: row.page_id,
          pageName: row.page_name,
          accessToken: decryptToken(row.access_token),
          scopes,
        },
      },
    };
  } catch {
    return {
      response: NextResponse.json(
        {
          error: 'The stored Page token is unreadable. Reconnect the Page.',
          code: 'not_connected',
        },
        { status: 409 }
      ),
    };
  }
}

export async function listManagedPages(
  workspaceId: string
): Promise<{ id: string; name: string; primary: boolean }[]> {
  const rows = (await sql`
    SELECT page_id, page_name, is_primary
    FROM facebook_pages
    WHERE workspace_id = ${workspaceId}
    ORDER BY is_primary DESC, page_name ASC
  `) as unknown as { page_id: string; page_name: string; is_primary: boolean }[];

  if (rows.length) {
    return rows.map((row) => ({
      id: row.page_id,
      name: row.page_name,
      primary: row.is_primary,
    }));
  }

  const fallback = (await sql`
    SELECT page_id, page_name
    FROM facebook_connections
    WHERE workspace_id = ${workspaceId}
  `) as unknown as { page_id: string; page_name: string }[];

  return fallback.map((row) => ({
    id: row.page_id,
    name: row.page_name,
    primary: true,
  }));
}

export async function resolvePageTargets(
  workspaceId: string,
  requestedIds: string[] = []
): Promise<PageTarget[]> {
  const rows = (await sql`
    SELECT page_id, page_name, access_token, is_primary
    FROM facebook_pages
    WHERE workspace_id = ${workspaceId}
    ORDER BY is_primary DESC, page_name ASC
  `) as unknown as ManagedPageRow[];

  let pages = rows;

  if (!pages.length) {
    const fallback = (await sql`
      SELECT page_id, page_name, access_token
      FROM facebook_connections
      WHERE workspace_id = ${workspaceId}
    `) as unknown as Omit<ManagedPageRow, 'is_primary'>[];

    pages = fallback.map((row) => ({ ...row, is_primary: true }));
  }

  const selected = requestedIds.length
    ? pages.filter((page) => requestedIds.includes(page.page_id))
    : pages.filter((page) => page.is_primary).slice(0, 1);

  return selected.slice(0, 10).map((page) => ({
    id: page.page_id,
    name: page.page_name,
    accessToken: decryptToken(page.access_token),
  }));
}
