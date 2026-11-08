import { createHash, randomBytes } from 'node:crypto';
import {
  encryptTikTokSecret,
  decryptTikTokSecret, // re-exported so the module keeps one crypto entry-point
} from '@/lib/facebook-token';
import { sql } from '@/lib/db';
import type { PlatformConnection } from '@/lib/publishing/connection';

export { encryptTikTokSecret, decryptTikTokSecret };

/**
 * TikTok scopes: basic identity + direct-post publishing. Consented together
 * so a reconnect never needs a second trip to TikTok's consent screen.
 */
export const TIKTOK_SCOPES = 'user.info.basic,video.publish';

/**
 * The TikTok app starts in sandbox: direct posts land as self-only private
 * videos until the Content Posting API is approved. TIKTOK_PUBLIC_POSTING
 * flips public/unlisted delivery on after review.
 */
export function tiktokPublicPostingApproved(): boolean {
  return process.env.TIKTOK_PUBLIC_POSTING === 'true';
}

export function tiktokConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY?.trim() &&
      process.env.TIKTOK_CLIENT_SECRET?.trim()
  );
}

export function tiktokRedirectUri(): string {
  const explicit = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (base) {
    try {
      return new URL('/api/tiktok/callback', base).toString();
    } catch {
      // Fall through to the local default.
    }
  }
  return 'http://localhost:3000/api/tiktok/callback';
}

/** TikTok enforces PKCE for user-granted tokens. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

export function buildTikTokAuthorizationUrl({
  state,
  codeChallenge,
}: {
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY!.trim());
  url.searchParams.set('scope', TIKTOK_SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', tiktokRedirectUri());
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
}

export type TikTokTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  scope: string[];
  /** TikTok grants are ~24h; openId identifies the app-user pair. */
  openId: string;
  expiresAt: string;
};

async function tikTokTokenRequest(
  params: Record<string, string>
): Promise<TikTokTokenResponse> {
  let response: Response;
  try {
    response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
  } catch {
    throw new Error('TikTok could not be reached.');
  }
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    open_id?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(
      body?.error_description ??
        body?.error ??
        'TikTok rejected the token request.'
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    scope: (body.scope ?? '').split(',').filter(Boolean),
    openId: body.open_id ?? '',
    expiresAt: new Date(
      Date.now() + (body.expires_in ?? 24 * 3600) * 1000
    ).toISOString(),
  };
}

export async function exchangeTikTokCode(
  code: string,
  codeVerifier: string
): Promise<TikTokTokenResponse> {
  return tikTokTokenRequest({
    code,
    code_verifier: codeVerifier,
    client_key: process.env.TIKTOK_CLIENT_KEY!.trim(),
    client_secret: process.env.TIKTOK_CLIENT_SECRET!.trim(),
    redirect_uri: tiktokRedirectUri(),
    grant_type: 'authorization_code',
  });
}

export class TikTokAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TikTokAuthError';
  }
}

/**
 * TikTok access tokens live ~24h. Uses the stored refresh token when the
 * access token is within 2 minutes of expiring, persisting the rotated
 * pair; a revoked grant surfaces as TikTokAuthError (route → 403 reconnect).
 */
export async function ensureFreshTikTokToken(
  connection: PlatformConnection,
  workspaceId: string
): Promise<string> {
  const expiresAt = connection.expiresAt ? Date.parse(connection.expiresAt) : 0;
  if (expiresAt - Date.now() > 120_000) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) {
    throw new TikTokAuthError(
      'The TikTok token expired and no refresh token is stored. Reconnect TikTok.'
    );
  }
  let fresh: TikTokTokenResponse;
  try {
    fresh = await tikTokTokenRequest({
      client_key: process.env.TIKTOK_CLIENT_KEY!.trim(),
      client_secret: process.env.TIKTOK_CLIENT_SECRET!.trim(),
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    });
  } catch (error) {
    throw new TikTokAuthError(
      error instanceof Error ? error.message : 'TikTok token refresh failed.'
    );
  }
  const scopes = fresh.scope.length ? fresh.scope : connection.scopes;
  await sql`
    UPDATE tiktok_connections
    SET access_token = ${encryptTikTokSecret(fresh.accessToken)},
        scopes = ${scopes.join(',')},
        expires_at = ${fresh.expiresAt},
        updated_at = now()
    WHERE workspace_id = ${workspaceId}
  `;
  return fresh.accessToken;
}

export type TikTokUser = {
  id: string;
  name: string;
  thumbnail: string | null;
};

export async function fetchTikTokUser(
  accessToken: string
): Promise<TikTokUser | null> {
  const url = new URL('https://open.tiktokapis.com/v2/user/info/');
  url.searchParams.set('fields', 'open_id,display_name,avatar_url');
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('TikTok could not be reached.');
  }
  if (response.status === 401) {
    throw new Error('The TikTok access token was rejected.');
  }
  if (!response.ok) {
    throw new Error(`TikTok returned ${response.status}.`);
  }
  const body = (await response.json().catch(() => null)) as {
    data?: {
      user?: {
        open_id?: string;
        display_name?: string;
        avatar_url?: string;
      };
    };
  } | null;
  const user = body?.data?.user;
  if (!user?.open_id) return null;
  return {
    id: user.open_id,
    name: user.display_name ?? 'TikTok',
    thumbnail: user.avatar_url ?? null,
  };
}

export type TikTokMetadata = {
  title: string;
  privacyStatus: 'SELF_ONLY' | 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS';
};

export type TikTokInitResult = {
  publishId: string;
};

/**
 * Opens a direct post with TikTok pulling the staged bytes itself
 * (PULL_FROM_URL) — never a browser relay, so staging caps are respected
 * and the buffer never crosses the workbench.
 */
export async function initTikTokVideoPost({
  accessToken,
  metadata,
  videoUrl,
}: {
  accessToken: string;
  metadata: TikTokMetadata;
  videoUrl: string;
}): Promise<TikTokInitResult> {
  let response: Response;
  try {
    response = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: metadata.title,
            privacy_level: metadata.privacyStatus,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        }),
      }
    );
  } catch {
    throw new Error('TikTok could not be reached.');
  }
  const body = (await response.json().catch(() => null)) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string };
  } | null;
  const publishId = body?.data?.publish_id;
  if (!response.ok || !publishId) {
    const apiMessage = body?.error?.message;
    throw new Error(
      apiMessage
        ? `TikTok rejected the post: ${apiMessage}`
        : `The TikTok post could not be opened (${response.status}).`
    );
  }
  return { publishId };
}

export type TikTokPublishStatus = {
  status: string | null;
  errors: string[];
};

/** Post-upload processing state — best-effort, null status when unreachable. */
export async function fetchTikTokPublishStatus(
  publishId: string,
  accessToken: string
): Promise<TikTokPublishStatus> {
  const url = new URL(
    'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
  );
  url.searchParams.set('publish_id', publishId);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return { status: null, errors: [] };
    }
    const body = (await response.json().catch(() => null)) as {
      data?: {
        status?: string;
        errors?: { message?: string }[];
      };
    } | null;
    return {
      status: body?.data?.status ?? null,
      errors: (body?.data?.errors ?? [])
        .map((entry) => entry.message ?? '')
        .filter(Boolean),
    };
  } catch {
    return { status: null, errors: [] };
  }
}
