import { sql } from "@/lib/db";
import { decryptToken } from "@/lib/facebook-token";

export type PageTokenRow = {
  page_id: string;
  access_token: string;
};

/**
 * Resolve the Page access token for a workspace.
 * Priority: managed page (by ID) → legacy connection (by ID) → primary managed page → legacy connection.
 */
export async function resolvePageToken(
  workspaceId: string,
  pageId: string | null
): Promise<string | null> {
  if (pageId) {
    // Try managed pages first
    const managed = (await sql`
      SELECT page_id, access_token FROM facebook_pages
      WHERE workspace_id = ${workspaceId} AND page_id = ${pageId}
      LIMIT 1`) as unknown as PageTokenRow[];
    if (managed[0]) {
      try {
        return decryptToken(managed[0].access_token);
      } catch {
        // fall through
      }
    }

    // Fall back to legacy connection
    const legacy = (await sql`
      SELECT page_id, access_token FROM facebook_connections
      WHERE workspace_id = ${workspaceId} AND page_id = ${pageId}
      LIMIT 1`) as unknown as PageTokenRow[];
    if (legacy[0]) {
      try {
        return decryptToken(legacy[0].access_token);
      } catch {
        // fall through
      }
    }
  }

  // No specific pageId, or it wasn't found — use primary page
  const primary = await getPrimaryPage(workspaceId);
  return primary ? primary.token : null;
}

/**
 * Get the primary Page for a workspace.
 * Priority: primary managed page → first managed page → legacy connection.
 */
export async function getPrimaryPage(
  workspaceId: string
): Promise<{ pageId: string; token: string } | null> {
  // Primary managed page
  const primaryManaged = (await sql`
    SELECT page_id, access_token FROM facebook_pages
    WHERE workspace_id = ${workspaceId}
    ORDER BY is_primary DESC, page_name ASC
    LIMIT 1`) as unknown as PageTokenRow[];

  if (primaryManaged[0]) {
    try {
      return { pageId: primaryManaged[0].page_id, token: decryptToken(primaryManaged[0].access_token) };
    } catch {
      // fall through
    }
  }

  // Fall back to legacy connection
  const legacy = (await sql`
    SELECT page_id, access_token FROM facebook_connections
    WHERE workspace_id = ${workspaceId}
    LIMIT 1`) as unknown as PageTokenRow[];

  if (legacy[0]) {
    try {
      return { pageId: legacy[0].page_id, token: decryptToken(legacy[0].access_token) };
    } catch {
      return null;
    }
  }

  return null;
}