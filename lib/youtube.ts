import { encryptYouTubeSecret } from '@/lib/facebook-token';
import { sql } from '@/lib/db';
import type { PlatformConnection } from '@/lib/publishing/connection';

export const YOUTUBE_UPLOAD_SCOPE =
  'https://www.googleapis.com/auth/youtube.upload';

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export function googleRedirectUri(): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (base) {
    try {
      return new URL('/api/youtube/callback', base).toString();
    } catch {
      // Fall through to the local default.
    }
  }
  return 'http://localhost:3000/api/youtube/callback';
}

/** consent + offline access are both required to receive a refresh token. */
export function buildGoogleAuthorizationUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!.trim());
  url.searchParams.set('redirect_uri', googleRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_UPLOAD_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  scope: string[];
  expiresAt: string;
};

async function googleTokenRequest(
  params: Record<string, string>
): Promise<GoogleTokenResponse> {
  let response: Response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
  } catch {
    throw new Error('Google could not be reached.');
  }
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(
      body?.error_description ?? body?.error ?? 'Google rejected the token request.'
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    scope: (body.scope ?? '').split(' ').filter(Boolean),
    expiresAt: new Date(
      Date.now() + (body.expires_in ?? 3600) * 1000
    ).toISOString(),
  };
}

export async function exchangeGoogleCode(
  code: string
): Promise<GoogleTokenResponse> {
  return googleTokenRequest({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirect_uri: googleRedirectUri(),
    grant_type: 'authorization_code',
  });
}

export class YouTubeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YouTubeAuthError';
  }
}

/**
 * Google access tokens live ~1h. Uses the stored refresh token when the
 * access token is within 2 minutes of expiring, persisting the rotated
 * pair; a revoked grant surfaces as YouTubeAuthError (route → 403 reconnect).
 */
export async function ensureFreshYouTubeToken(
  connection: PlatformConnection,
  workspaceId: string
): Promise<string> {
  const expiresAt = connection.expiresAt ? Date.parse(connection.expiresAt) : 0;
  if (expiresAt - Date.now() > 120_000) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) {
    throw new YouTubeAuthError(
      'The YouTube token expired and no refresh token is stored. Reconnect YouTube.'
    );
  }
  let fresh: GoogleTokenResponse;
  try {
    fresh = await googleTokenRequest({
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    });
  } catch (error) {
    throw new YouTubeAuthError(
      error instanceof Error ? error.message : 'YouTube token refresh failed.'
    );
  }
  const scopes = fresh.scope.length ? fresh.scope : connection.scopes;
  await sql`
    UPDATE youtube_connections
    SET access_token = ${encryptYouTubeSecret(fresh.accessToken)},
        scopes = ${scopes.join(', ')},
        expires_at = ${fresh.expiresAt},
        updated_at = now()
    WHERE workspace_id = ${workspaceId}
  `;
  return fresh.accessToken;
}

export type YouTubeChannel = {
  id: string;
  title: string;
  thumbnail: string | null;
};

export async function fetchYouTubeChannel(
  accessToken: string
): Promise<YouTubeChannel | null> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('YouTube could not be reached.');
  }
  if (response.status === 401) {
    throw new Error('The YouTube access token was rejected.');
  }
  if (!response.ok) {
    throw new Error(`YouTube returned ${response.status}.`);
  }
  const body = (await response.json().catch(() => null)) as {
    items?: {
      id: string;
      snippet?: {
        title?: string;
        thumbnails?: { high?: { url?: string } };
      };
    }[];
  } | null;
  const channel = body?.items?.[0];
  if (!channel) return null;
  return {
    id: channel.id,
    title: channel.snippet?.title ?? 'YouTube',
    thumbnail: channel.snippet?.thumbnails?.high?.url ?? null,
  };
}

export type YouTubeMetadata = {
  title: string;
  description: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  madeForKids: boolean;
  tags?: string[];
};

export async function createYouTubeUploadSession({
  accessToken,
  sizeBytes,
  contentType,
  metadata,
}: {
  accessToken: string;
  sizeBytes: number;
  contentType: string;
  metadata: YouTubeMetadata;
}): Promise<string> {
  const url = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
  url.searchParams.set('uploadType', 'resumable');
  url.searchParams.set('part', 'snippet,status');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(sizeBytes),
        'x-upload-content-type': contentType,
      },
      body: JSON.stringify({
        snippet: {
          title: metadata.title,
          description: metadata.description,
          ...(metadata.tags?.length ? { tags: metadata.tags } : {}),
        },
        status: {
          privacyStatus: metadata.privacyStatus,
          selfDeclaredMadeForKids: metadata.madeForKids,
        },
      }),
    });
  } catch {
    throw new Error('YouTube could not be reached.');
  }
  const location = response.headers.get('location');
  if (!response.ok || !location) {
    const detail = await response.json().catch(() => null);
    throw new Error(
      (detail as { error?: { message?: string } } | null)?.error?.message ??
        `The YouTube upload session could not be opened (${response.status}).`
    );
  }
  return location;
}

export async function uploadYouTubeBytes(
  location: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const response = await fetch(location, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'content-length': String(bytes.length),
    },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    } | null;
    const reason = detail?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') {
      throw new Error(
        'The YouTube upload quota for today is exhausted. Try again tomorrow (it resets at midnight Pacific).'
      );
    }
    throw new Error(
      detail?.error?.message ?? `YouTube rejected the upload (${response.status}).`
    );
  }
  const body = (await response.json().catch(() => null)) as { id?: string };
  if (!body?.id) {
    throw new Error('YouTube did not return a video id.');
  }
  return body.id;
}

export async function fetchYouTubeVideoStatus(
  videoId: string,
  accessToken: string
): Promise<{ uploadStatus: string | null; thumbnail: string | null }> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'status,snippet');
  url.searchParams.set('id', videoId);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { uploadStatus: null, thumbnail: null };
  const body = (await response.json().catch(() => null)) as {
    items?: {
      snippet?: { thumbnails?: { high?: { url?: string } } };
      status?: { uploadStatus?: string };
    }[];
  };
  return {
    uploadStatus: body?.items?.[0]?.status?.uploadStatus ?? null,
    thumbnail: body?.items?.[0]?.snippet?.thumbnails?.high?.url ?? null,
  };
}
