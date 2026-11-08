/**
 * Scopes that stack on top of the Facebook Page grant when connecting
 * through the Instagram composer. One Meta app, one reconnect, both gates.
 */
export const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
] as const;

/** Scopes the stored grant must include before Instagram publishing works. */
export const REQUIRED_INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
] as const;

export class InstagramApiError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'InstagramApiError';
    this.code = code;
  }
}

export type InstagramAccount = {
  id: string;
  username: string;
  picture: string | null;
};

function instagramGraphVersion(): string {
  const value = process.env.FACEBOOK_GRAPH_VERSION?.trim();
  return value && /^v\d+\.\d+$/.test(value) ? value : 'v23.0';
}

function instagramGraphUrl(path: string): URL {
  return new URL(`https://graph.facebook.com/${instagramGraphVersion()}/${path}`);
}

async function igRequest<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET'
): Promise<T> {
  const url = instagramGraphUrl(path);
  if (method === 'GET') {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('access_token', accessToken);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      ...(method === 'POST'
        ? {
            body: new URLSearchParams({ ...params, access_token: accessToken }),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
          }
        : {}),
    });
  } catch {
    throw new InstagramApiError('Instagram could not be reached.');
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as { error?: { message?: string; code?: number } };
    if (detail?.error?.message) {
      throw new InstagramApiError(detail.error.message, detail.error.code);
    }
    throw new InstagramApiError(`Instagram returned ${response.status}.`);
  }
  if (!body) {
    throw new InstagramApiError('Instagram returned an empty response.');
  }
  return body as T;
}

export type ContainerStatus = {
  statusCode: string | null;
  statusMessage: string | null;
};

export async function fetchInstagramAccount(
  pageId: string,
  pageAccessToken: string
): Promise<InstagramAccount | null> {
  const body = await igRequest<{
    instagram_business_account?: {
      id: string;
      username?: string;
      profile_picture_url?: string;
    } | null;
  }>(pageId, { fields: 'instagram_business_account{id,username,profile_picture_url}' }, pageAccessToken);
  const ig = body.instagram_business_account;
  if (!ig) return null;
  return {
    id: ig.id,
    username: ig.username ?? 'instagram',
    picture: ig.profile_picture_url ?? null,
  };
}

export async function createImageMediaContainer({
  igUserId,
  imageToken,
  imageUrl,
  caption,
}: {
  igUserId: string;
  imageToken: string;
  imageUrl: string;
  caption?: string;
}): Promise<string> {
  const params: Record<string, string> = { image_url: imageUrl };
  if (caption) params.caption = caption;
  const body = await igRequest<{ id?: string }>(
    `${igUserId}/media`,
    params,
    imageToken,
    'POST'
  );
  if (!body.id) {
    throw new InstagramApiError('Instagram returned no media container id.');
  }
  return body.id;
}

export async function getContainerStatus(
  igUserId: string,
  containerId: string,
  accessToken: string
): Promise<ContainerStatus> {
  const body = await igRequest<ContainerStatus>(
    containerId,
    { fields: 'status_code,status_message' },
    accessToken
  );
  // Ignore the ig user id in the path — Graph resolves by container id.
  void igUserId;
  return {
    statusCode: body.statusCode ?? (body as { status_code?: string }).status_code ?? null,
    statusMessage:
      body.statusMessage ?? (body as { status_message?: string }).status_message ?? null,
  };
}

export async function publishMediaContainer({
  igUserId,
  accessToken,
  containerId,
}: {
  igUserId: string;
  accessToken: string;
  containerId: string;
}): Promise<string> {
  const body = await igRequest<{ id?: string }>(
    `${igUserId}/media_publish`,
    { creation_id: containerId },
    accessToken,
    'POST'
  );
  if (!body.id) {
    throw new InstagramApiError('Instagram did not return a published media id.');
  }
  return body.id;
}

export async function fetchMediaPermalink(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  const body = await igRequest<{ permalink?: string }>(
    mediaId,
    { fields: 'permalink' },
    accessToken
  );
  return body.permalink ?? null;
}
