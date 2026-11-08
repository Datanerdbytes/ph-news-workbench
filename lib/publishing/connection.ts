import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { graphRequest } from '@/lib/facebook';
import { decryptToken, decryptTikTokSecret, decryptYouTubeSecret } from '@/lib/facebook-token';
import { requireWorkspace, unauthorized } from '@/lib/session';

type ConnectionRow = {
  page_id: string;
  page_name: string;
  access_token: string;
  scopes: string | null;
};

/** Pages whose picture self-heal already ran in this server process. */
const pictureSelfHealTried = new Set<string>();

type ManagedPageRow = {
  page_id: string;
  page_name: string;
  access_token: string;
  page_picture_url: string | null;
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

export type ManagedPage = {
  id: string;
  name: string;
  picture: string | null;
  primary: boolean;
};

export async function listManagedPages(
  workspaceId: string
): Promise<ManagedPage[]> {
  const rows = (await sql`
    SELECT page_id, page_name, access_token, page_picture_url, is_primary
    FROM facebook_pages
    WHERE workspace_id = ${workspaceId}
    ORDER BY is_primary DESC, page_name ASC
  `) as unknown as ManagedPageRow[];

  if (rows.length) {
    // Self-heal rows stored before page pictures existed: fetch the Graph
    // picture once per page per server process and persist it, so later
    // requests serve it from the DB (silhouette pages never converge, hence
    // the one-attempt guard).
    await Promise.all(
      rows
        .filter((row) => !row.page_picture_url)
        .map(async (row) => {
          const key = `${workspaceId}:${row.page_id}`;
          if (pictureSelfHealTried.has(key)) return;
          pictureSelfHealTried.add(key);
          try {
            const picture = await fetchPagePictureUrl(row.page_id, decryptToken(row.access_token));
            if (!picture) return;
            row.page_picture_url = picture;
            await sql`UPDATE facebook_pages SET page_picture_url = ${picture} WHERE workspace_id = ${workspaceId} AND page_id = ${row.page_id}`;
          } catch {
            // Best effort — the UI falls back to initials when absent.
          }
        })
    );

    return rows.map((row) => ({
      id: row.page_id,
      name: row.page_name,
      picture: row.page_picture_url,
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
    picture: null,
    primary: true,
  }));
}

/** Profile picture URL for one page via the Graph API (no extra permission needed). */
async function fetchPagePictureUrl(
  pageId: string,
  pageToken: string
): Promise<string | null> {
  const body = await graphRequest<{
    data?: { url?: string; is_silhouette?: boolean };
  }>(`${pageId}/picture`, { redirect: 'false', type: 'large' }, pageToken);
  return body.data?.url && !body.data.is_silhouette ? body.data.url : null;
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

// ---------------------------------------------------------------------------
// Non-Facebook platform connections. Instagram has no table by design — an
// IG business account hangs off the connected Facebook Page, so its gate is
// requirePublishingConnection and the Instagram slice probes the linked
// account through it. YouTube and TikTok own their OAuth and get one row
// per workspace in <platform>_connections.
// ---------------------------------------------------------------------------

export type PlatformProvider = 'youtube' | 'tiktok' | 'instagram';

export type PlatformConnection = {
  platform: PlatformProvider;
  platformUserId: string;
  username: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  /** ISO timestamp when the access token stops working, when the API says. */
  expiresAt: string | null;
};

export type PlatformConnectionContext = {
  access: WorkspaceAccess;
  connection: PlatformConnection;
};

export type PlatformConnectionResult =
  | { context: PlatformConnectionContext; response?: never }
  | { context?: never; response: NextResponse };

type PlatformProviderConfig = {
  name: string;
  table: () => string;
  columns: () => { userId: string; hasRefresh: boolean };
  requiredScopes: string[];
  decrypt: (payload: string) => string;
};

export const PLATFORM_PROVIDERS: Record<
  Exclude<PlatformProvider, 'instagram'>,
  PlatformProviderConfig
> = {
  youtube: {
    name: 'YouTube',
    table: () => 'youtube_connections',
    columns: () => ({ userId: 'youtube_user_id', hasRefresh: true }),
    requiredScopes: ['https://www.googleapis.com/auth/youtube.upload'],
    decrypt: decryptYouTubeSecret,
  },
  tiktok: {
    name: 'TikTok',
    table: () => 'tiktok_connections',
    columns: () => ({ userId: 'tiktok_user_id', hasRefresh: true }),
    requiredScopes: [],
    decrypt: decryptTikTokSecret,
  },
};

export function isPlatformProvider(value: string): value is PlatformProvider {
  return value === 'youtube' || value === 'tiktok' || value === 'instagram';
}

export function platformProviderName(provider: PlatformProvider): string {
  return provider === 'instagram' ? 'Instagram' : PLATFORM_PROVIDERS[provider].name;
}

type PlatformRow = {
  platform_user_id: string;
  username: string;
  access_token: string;
  refresh_token: string | null;
  scopes: string | null;
  expires_at: Date | string | null;
};

function toIsoTimestamp(value: unknown): string | null {
  if (!value) return null;
  const date =
    value instanceof Date ? value : new Date(typeof value === 'string' ? value : Number(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

/**
 * Auth-and-load gate for a non-Facebook publisher. Mirrors
 * requirePublishingConnection: 409 when not connected, 403 when the stored
 * grant lacks a publish scope, 500 when the row cannot be read.
 */
export async function requirePlatformConnection(
  request: Request,
  provider: Exclude<PlatformProvider, 'instagram'>,
  action: string
): Promise<PlatformConnectionResult> {
  const access = await requireWorkspace(request);
  if (!access) return { response: unauthorized() };

  const config = PLATFORM_PROVIDERS[provider];
  const name = config.name;

  let rows: PlatformRow[];
  try {
    if (provider === 'youtube') {
      rows = (await sql`
        SELECT youtube_user_id AS platform_user_id, username, access_token, refresh_token, scopes, expires_at
        FROM youtube_connections
        WHERE workspace_id = ${access.workspace.id}
      `) as unknown as PlatformRow[];
    } else {
      rows = (await sql`
        SELECT tiktok_user_id AS platform_user_id, username, access_token, refresh_token, scopes, expires_at
        FROM tiktok_connections
        WHERE workspace_id = ${access.workspace.id}
      `) as unknown as PlatformRow[];
    }
  } catch {
    return {
      response: NextResponse.json(
        {
          error: `Could not read the ${name} connection.`,
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
          error: `Connect your ${name} account before ${action}.`,
          code: 'not_connected',
        },
        { status: 409 }
      ),
    };
  }

  const scopes = (row.scopes ?? '').split(',').filter(Boolean);
  const missing = config.requiredScopes.filter((scope) => !scopes.includes(scope));
  if (missing.length) {
    return {
      response: NextResponse.json(
        {
          error: `This connection cannot ${action}. Reconnect ${name} to grant ${missing.join(' + ')}.`,
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
          platform: provider,
          platformUserId: row.platform_user_id,
          username: row.username,
          accessToken: config.decrypt(row.access_token),
          refreshToken: row.refresh_token && config.columns().hasRefresh ? config.decrypt(row.refresh_token) : undefined,
          scopes,
          expiresAt: toIsoTimestamp(row.expires_at),
        },
      },
    };
  } catch {
    return {
      response: NextResponse.json(
        {
          error: `The stored ${name} token is unreadable. Reconnect ${name}.`,
          code: 'not_connected',
        },
        { status: 409 }
      ),
    };
  }
}

/**
 * Row load without request gating — the executor in crosspost.ts resolves
 * the publishing account through this helper.
 */
export async function resolvePlatformAccount(
  workspaceId: string,
  provider: Exclude<PlatformProvider, 'instagram'>
): Promise<PlatformConnection | null> {
  const rows =
    provider === 'youtube'
      ? ((await sql`
          SELECT youtube_user_id AS platform_user_id, username, access_token, refresh_token, scopes, expires_at
          FROM youtube_connections
          WHERE workspace_id = ${workspaceId}
        `) as unknown as PlatformRow[])
      : ((await sql`
          SELECT tiktok_user_id AS platform_user_id, username, access_token, refresh_token, scopes, expires_at
          FROM tiktok_connections
          WHERE workspace_id = ${workspaceId}
        `) as unknown as PlatformRow[]);

  const row = rows[0];
  if (!row) return null;
  const config = PLATFORM_PROVIDERS[provider];
  return {
    platform: provider,
    platformUserId: row.platform_user_id,
    username: row.username,
    accessToken: config.decrypt(row.access_token),
    refreshToken:
      row.refresh_token && config.columns().hasRefresh ? config.decrypt(row.refresh_token) : undefined,
    scopes: (row.scopes ?? '').split(',').filter(Boolean),
    expiresAt: toIsoTimestamp(row.expires_at),
  };
}
