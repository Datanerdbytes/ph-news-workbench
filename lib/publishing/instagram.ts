import { decryptToken } from '@/lib/facebook-token';
import { sql } from '@/lib/db';
import {
  createImageMediaContainer,
  fetchInstagramAccount,
  fetchMediaPermalink,
  getContainerStatus,
  InstagramAccount,
  InstagramApiError,
  publishMediaContainer,
  REQUIRED_INSTAGRAM_SCOPES,
} from '@/lib/instagram';

export type InstagramPublishResult = {
  id: string;
  permalink: string | null;
};

export type InstagramAccountResolution =
  | { ok: true; account: InstagramAccount; accessToken: string; scopes: string[]; pageId: string }
  | {
      ok: false;
      reason: 'not_connected' | 'scope_missing' | 'no_ig_account' | 'probe_failed';
      detail: string | null;
    };

/**
 * Instagram has no connection table of its own — the business account hangs
 * off the connected Facebook Page, so resolution reads facebook_connections
 * and probes the Graph link. Callers surface `reason` as the composer gate.
 */
export async function resolveInstagramAccount(
  workspaceId: string
): Promise<InstagramAccountResolution> {
  let rows: {
    page_id: string;
    page_name: string;
    access_token: string;
    scopes: string | null;
  }[];
  try {
    rows = (await sql`
      SELECT page_id, page_name, access_token, scopes
      FROM facebook_connections
      WHERE workspace_id = ${workspaceId}
    `) as unknown as typeof rows;
  } catch {
    return { ok: false, reason: 'not_connected', detail: null };
  }

  const row = rows[0];
  if (!row) {
    return { ok: false, reason: 'not_connected', detail: null };
  }

  const scopes = (row.scopes ?? '').split(',').filter(Boolean);
  const missing = REQUIRED_INSTAGRAM_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missing.length) {
    return { ok: false, reason: 'scope_missing', detail: missing.join(' + ') };
  }

  let pageToken: string;
  try {
    pageToken = decryptToken(row.access_token);
  } catch {
    return { ok: false, reason: 'not_connected', detail: 'stored token unreadable' };
  }

  let account: InstagramAccount | null;
  try {
    account = await fetchInstagramAccount(row.page_id, pageToken);
  } catch (error) {
    return {
      ok: false,
      reason: 'probe_failed',
      detail: error instanceof Error ? error.message : null,
    };
  }

  if (!account) {
    return {
      ok: false,
      reason: 'no_ig_account',
      detail:
        'Connect this Page to a professional Instagram account and try again.',
    };
  }

  return { ok: true, account, accessToken: pageToken, scopes, pageId: row.page_id };
}

/**
 * Image post, end to end: container → status polling → publish → permalink.
 * Media processing is asynchronous; the poll gives an average container up
 * to 90 seconds before surfacing a retry hint.
 */
export async function publishInstagramImagePost({
  account,
  accessToken,
  imageUrl,
  caption,
  deadlineMs = 90_000,
  pollMs = 2000,
}: {
  account: InstagramAccount;
  accessToken: string;
  imageUrl: string;
  caption: string;
  /** Injected only by tests to keep them off real wait loops. */
  deadlineMs?: number;
  pollMs?: number;
}): Promise<InstagramPublishResult> {
  const containerId = await createImageMediaContainer({
    igUserId: account.id,
    imageToken: accessToken,
    imageUrl,
    caption,
  });

  const deadline = Date.now() + deadlineMs;
  let lastStatus: string | null = null;
  let lastMessage: string | null = null;

  while (Date.now() < deadline) {
    const status = await getContainerStatus(account.id, containerId, accessToken);
    lastStatus = status.statusCode;
    lastMessage = status.statusMessage;

    if (status.statusCode === 'FINISHED') {
      const mediaId = await publishMediaContainer({
        igUserId: account.id,
        accessToken,
        containerId,
      });
      const permalink = await fetchMediaPermalink(mediaId, accessToken);
      return { id: mediaId, permalink };
    }

    if (
      status.statusCode === 'ERROR' ||
      status.statusCode === 'EXPIRED'
    ) {
      throw new InstagramApiError(
        lastMessage || 'Instagram could not process the image.'
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new InstagramApiError(
    lastMessage
      ? `Instagram is still processing the image (${lastStatus}). Retry shortly.`
      : 'Instagram is still processing the image. Retry shortly.'
  );
}
