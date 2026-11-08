const DEFAULT_GRAPH_VERSION = 'v23.0';
const TIMEOUT_MS = 15_000;
const REEL_UPLOAD_TIMEOUT_MS = 5 * 60_000;
export const MAX_POST_IMAGES = 10;

// pages_manage_posts must be enabled on the app's Pages use case before the
// login dialog will grant it.
// business_management is required for Pages owned by a Business portfolio;
// without it /me/accounts omits those Pages entirely.
export const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
] as const;

export class FacebookApiError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'FacebookApiError';
    this.code = code;
  }
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type PageNode = {
  id: string;
  name: string;
  access_token?: string;
  picture?: { data?: { url?: string; is_silhouette?: boolean } };
};

type PermissionNode = {
  permission: string;
  status: string;
};

export type GraphErrorBody = {
  error?: { message?: string; code?: number; type?: string };
};

export type ConnectedFacebookPage = {
  id: string;
  name: string;
  accessToken: string;
  picture: string | null;
};

export function facebookConfigured(): boolean {
  return Boolean(
    process.env.FACEBOOK_APP_ID?.trim() &&
      process.env.FACEBOOK_APP_SECRET?.trim()
  );
}

export function facebookGraphVersion(): string {
  const value = process.env.FACEBOOK_GRAPH_VERSION?.trim();
  return value && /^v\d+\.\d+$/.test(value) ? value : DEFAULT_GRAPH_VERSION;
}

export function facebookRedirectUri(): string {
  const explicit = process.env.FACEBOOK_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const base = process.env.BETTER_AUTH_URL?.trim();
  if (base) {
    try {
      return new URL('/api/facebook/callback', base).toString();
    } catch {
      // Fall through to the local default.
    }
  }

  return 'http://localhost:3000/api/facebook/callback';
}

export function buildAuthorizationUrl(
  state: string,
  extraScopes: readonly string[] = []
): string {
  const url = new URL(
    `https://www.facebook.com/${facebookGraphVersion()}/dialog/oauth`
  );
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID!.trim());
  url.searchParams.set('redirect_uri', facebookRedirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  // Instagram publishing rides the same Meta app grant: the extra IG scopes
  // stack on top of the Facebook Page scopes so one reconnect covers both.
  url.searchParams.set(
    'scope',
    [...new Set([...FACEBOOK_SCOPES, ...extraScopes])].join(',')
  );
  return url.toString();
}

export async function graphRequest<T>(
  path: string,
  params: Record<string, string>,
  accessToken?: string
): Promise<T> {
  const url = new URL(
    `https://graph.facebook.com/${facebookGraphVersion()}/${path}`
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (accessToken) url.searchParams.set('access_token', accessToken);

  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new FacebookApiError('Facebook could not be reached.');
  }

  const body = (await response.json().catch(() => null)) as
    | (T & GraphErrorBody)
    | null;

  if (!response.ok || body?.error) {
    throw new FacebookApiError(
      body?.error?.message ?? `Facebook request failed (${response.status}).`,
      body?.error?.code
    );
  }

  if (!body) {
    throw new FacebookApiError('Facebook returned an empty response.');
  }

  return body;
}

/**
 * DELETE a Graph node. Used to cancel a post that Facebook itself is
 * holding in its scheduled queue.
 */
export async function graphDelete(
  path: string,
  accessToken: string
): Promise<{ success?: boolean }> {
  const url = new URL(
    `https://graph.facebook.com/${facebookGraphVersion()}/${path}`
  );
  url.searchParams.set('access_token', accessToken);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'DELETE',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new FacebookApiError('Facebook could not be reached.');
  }

  const body = (await response.json().catch(() => null)) as
    | ({ success?: boolean } & GraphErrorBody)
    | null;

  if (!response.ok || body?.error) {
    throw new FacebookApiError(
      body?.error?.message ?? `Facebook request failed (${response.status}).`,
      body?.error?.code
    );
  }

  return body ?? {};
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const body = await graphRequest<TokenResponse>('oauth/access_token', {
    client_id: process.env.FACEBOOK_APP_ID!.trim(),
    client_secret: process.env.FACEBOOK_APP_SECRET!.trim(),
    redirect_uri: facebookRedirectUri(),
    code,
  });

  if (!body.access_token) {
    throw new FacebookApiError('Facebook did not return an access token.');
  }
  return body.access_token;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<string> {
  const body = await graphRequest<TokenResponse>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.FACEBOOK_APP_ID!.trim(),
    client_secret: process.env.FACEBOOK_APP_SECRET!.trim(),
    fb_exchange_token: shortLivedToken,
  });

  if (!body.access_token) {
    throw new FacebookApiError('Facebook did not return a long-lived token.');
  }
  return body.access_token;
}

export async function fetchPages(
  userAccessToken: string
): Promise<ConnectedFacebookPage[]> {
  const body = await graphRequest<{
    data?: PageNode[];
    paging?: { next?: string };
  }>(
    'me/accounts',
    { fields: 'id,name,access_token,picture.type(large)', limit: '100' },
    userAccessToken
  );

  // Follow Graph pagination cursors so accounts managing more than one page
  // of results (100 per request) still get every page stored. Hard-capped to
  // keep a misbehaving token from looping forever.
  const nodes = [...(body.data ?? [])];
  let next = body.paging?.next;
  for (let extra = 0; next && extra < 4; extra += 1) {
    try {
      const res = await fetch(next);
      if (!res.ok) break;
      const page = (await res.json()) as {
        data?: PageNode[];
        paging?: { next?: string };
      };
      nodes.push(...(page.data ?? []));
      next = page.paging?.next;
    } catch {
      // A failed extra page beats losing the whole connect — keep what we have.
      break;
    }
  }

  return nodes
    .filter((page) => page.access_token)
    .map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token!,
      // Default silhouettes are stored as null so the UI can fall back to
      // initials instead of showing the generic gray avatar.
      picture:
        page.picture?.data?.url && !page.picture.data.is_silhouette
          ? page.picture.data.url
          : null,
    }));
}
export async function fetchGrantedScopes(
  userAccessToken: string
): Promise<string[]> {
  const body = await graphRequest<{ data?: PermissionNode[] }>(
    'me/permissions',
    {},
    userAccessToken
  );

  return (body.data ?? [])
    .filter((permission) => permission.status === 'granted')
    .map((permission) => permission.permission);
}

export function selectPage(
  pages: ConnectedFacebookPage[],
  pinnedPageId?: string
): ConnectedFacebookPage | null {
  if (pinnedPageId) {
    return pages.find((page) => page.id === pinnedPageId) ?? null;
  }
  return pages[0] ?? null;
}

type PageAudienceBody = {
  name?: string;
  fan_count?: number;
  followers_count?: number;
};

type InsightsBody = {
  data?: { name?: string; values?: { value?: number }[] }[];
};

export type PageAudience = {
  pageName: string;
  fans: number | null;
  followers: number | null;
};

export type PageActivity = {
  engagements7d: number | null;
  mediaViews7d: number | null;
};

export async function fetchPageAudience(
  pageId: string,
  accessToken: string
): Promise<PageAudience> {
  const body = await graphRequest<PageAudienceBody>(
    pageId,
    { fields: 'name,fan_count,followers_count' },
    accessToken
  );

  return {
    pageName: body.name ?? 'Facebook Page',
    fans: typeof body.fan_count === 'number' ? body.fan_count : null,
    followers:
      typeof body.followers_count === 'number' ? body.followers_count : null,
  };
}

// Meta retires Page Insights metric names without notice, so each metric is
// fetched independently and failures degrade to null instead of the whole call.
export async function fetchPageActivity(
  pageId: string,
  accessToken: string
): Promise<PageActivity> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 7 * 24 * 60 * 60;

  async function total(metric: string): Promise<number | null> {
    try {
      const body = await graphRequest<InsightsBody>(
        `${pageId}/insights`,
        {
          metric,
          period: 'day',
          since: String(since),
          until: String(until),
        },
        accessToken
      );
      const series = body.data?.[0]?.values ?? [];
      return series.reduce(
        (sum, point) =>
          sum + (typeof point.value === 'number' ? point.value : 0),
        0
      );
    } catch {
      return null;
    }
  }

  const [engagements7d, mediaViews7d] = await Promise.all([
    total('page_post_engagements'),
    total('page_media_view'),
  ]);

  return { engagements7d, mediaViews7d };
}

export function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  timeoutMs = TIMEOUT_MS
): Promise<T> {
  const query = new URLSearchParams({
    ...params,
    access_token: accessToken,
  });
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${facebookGraphVersion()}/${path}?${query}`,
      {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
  } catch {
    throw new FacebookApiError('Facebook could not be reached.');
  }

  const body = (await response.json().catch(() => null)) as
    | (T & GraphErrorBody)
    | null;

  if (!response.ok || body?.error) {
    throw new FacebookApiError(
      body?.error?.message ?? `Facebook request failed (${response.status}).`,
      body?.error?.code
    );
  }
  if (!body) {
    throw new FacebookApiError('Facebook returned an empty response.');
  }
  return body;
}

/**
 * Whether a Facebook-scheduled reel video has actually gone live. Facebook
 * stays the executor for source='facebook' scheduled rows; this only reads
 * status so the local record can mirror it.
 */
export async function isFacebookVideoPublished(
  videoId: string,
  accessToken: string
): Promise<boolean | null> {
  try {
    const body = await graphGet<{
      is_published?: boolean;
      status?: { video_status?: string };
    }>(videoId, { fields: 'is_published,status.video_status' }, accessToken);
    if (typeof body.is_published === 'boolean') return body.is_published;
    const videoStatus = body.status?.video_status;
    if (videoStatus === 'error') return false;
    if (videoStatus === 'ready' || videoStatus === 'complete') return true;
    return null;
  } catch (error) {
    if (error instanceof FacebookApiError && error.code === 100) {
      // Unknown fields for this node version — cannot tell.
      return null;
    }
    throw error;
  }
}

/**
 * Whether a Page post that was scheduled on Facebook has gone live. Facebook
 * holds the post unpublished until its scheduled time, then flips `published`
 * to true.
 */
export async function isFacebookPostPublished(
  postId: string,
  accessToken: string
): Promise<boolean | null> {
  try {
    const body = await graphGet<{ published?: boolean }>(
      postId,
      { fields: 'published' },
      accessToken
    );
    if (typeof body.published === 'boolean') return body.published;
    return null;
  } catch (error) {
    if (error instanceof FacebookApiError && error.code === 100) {
      return null;
    }
    throw error;
  }
}

/**
 * Whether a scheduled live video has started (or already ended). Facebook
 * keeps a planned stream in UNPUBLISHED/SCHEDULED until its start time.
 */
export async function isFacebookLiveStarted(
  liveVideoId: string,
  accessToken: string
): Promise<boolean | null> {
  try {
    const body = await graphGet<{ status?: string }>(
      liveVideoId,
      { fields: 'status' },
      accessToken
    );
    const status = (body.status ?? '').toUpperCase();
    if (!status) return null;
    if (status === 'LIVE_NOW' || status === 'VOD') return true;
    if (status === 'ERROR' || status === 'FAILED') return false;
    // UNPUBLISHED / SCHEDULED / WAITING — still pending.
    return false;
  } catch (error) {
    if (error instanceof FacebookApiError && error.code === 100) {
      return null;
    }
    throw error;
  }
}

/**
 * Cancel a post that Facebook is holding in its scheduled queue.
 */
export async function cancelFacebookScheduledPost(
  postId: string,
  accessToken: string,
  pageId?: string | null
): Promise<void> {
  // Reel and video container ids only resolve in their compound
  // `{page-id}_{post-id}` form — a bare DELETE of the container id is refused
  // with "(#12) singular statuses API is deprecated". Try the compound form
  // first, then fall back to the bare id for kinds where only it exists.
  if (pageId && !postId.includes('_')) {
    let compoundError: unknown;
    try {
      await graphDelete(`${pageId}_${postId}`, accessToken);
      return;
    } catch (error) {
      compoundError = error;
    }
    try {
      await graphDelete(postId, accessToken);
      return;
    } catch {
      // Nothing worked — surface the compound-form error, it is the
      // meaningful one for reel/video containers.
      throw compoundError;
    }
  }
  await graphDelete(postId, accessToken);
}

/**
 * Whether Facebook is still holding a scheduled item in its own queue
 * (`/{page-id}/scheduled_posts`). Reel and video container nodes cannot be
 * read directly — a bare GET is refused with code 12, and the compound node
 * stops existing once Facebook publishes — so membership of this edge is the
 * only reliable signal for those kinds. `null` when the edge is unreadable.
 */
export async function isFacebookStillScheduled(
  pageId: string,
  postId: string,
  accessToken: string
): Promise<boolean | null> {
  try {
    const body = await graphGet<{ data?: Array<{ id?: string }> }>(
      `${pageId}/scheduled_posts`,
      { fields: 'id', limit: '100' },
      accessToken
    );
    const compound = `${pageId}_${postId}`;
    for (const entry of body.data ?? []) {
      if (!entry.id) continue;
      if (
        entry.id === compound ||
        entry.id === postId ||
        entry.id.endsWith(`_${postId}`)
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return null;
  }
}

export type GraphUploadFile = {
  field: string;
  bytes: Buffer;
  type: string;
  filename: string;
};

export async function graphPostForm<T>(
  path: string,
  fields: Record<string, string>,
  accessToken: string,
  files: GraphUploadFile[] = [],
  timeoutMs = TIMEOUT_MS
): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  form.append('access_token', accessToken);
  for (const file of files) {
    form.append(
      file.field,
      new Blob([toArrayBuffer(file.bytes)], { type: file.type }),
      file.filename
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${facebookGraphVersion()}/${path}`,
      {
        method: 'POST',
        body: form,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
  } catch {
    throw new FacebookApiError('Facebook could not be reached.');
  }

  const body = (await response.json().catch(() => null)) as
    | (T & GraphErrorBody)
    | null;

  if (!response.ok || body?.error) {
    throw new FacebookApiError(
      body?.error?.message ?? `Facebook request failed (${response.status}).`,
      body?.error?.code
    );
  }

  if (!body) {
    throw new FacebookApiError('Facebook returned an empty response.');
  }

  return body;
}

async function graphPost<T>(
  path: string,
  fields: Record<string, string>,
  accessToken: string,
  file?: { bytes: Buffer; type: string; filename: string }
): Promise<T> {
  return graphPostForm(
    path,
    fields,
    accessToken,
    file ? [{ field: 'source', ...file }] : []
  );
}

export type PublishImage =
  | { url: string }
  | { base64: string; type: string; filename: string };

export type PublishedPost = {
  id: string;
  permalink: string | null;
};

const DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

export function parseImages(value: unknown): PublishImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): PublishImage | null => {
      if (typeof entry !== 'string') return null;
      const data = entry.match(DATA_URL);
      if (data) {
        const type = data[1].toLowerCase();
        const extension =
          type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
        return { base64: data[2], type, filename: `post.${extension}` };
      }
      if (/^https?:\/\//i.test(entry)) return { url: entry };
      return null;
    })
    .filter((image): image is PublishImage => image !== null)
    .slice(0, MAX_POST_IMAGES);
}

async function postPermalink(
  id: string,
  accessToken: string
): Promise<string | null> {
  try {
    const body = await graphRequest<{ permalink_url?: string }>(
      id,
      { fields: 'permalink_url' },
      accessToken
    );
    return body.permalink_url ?? null;
  } catch {
    return null;
  }
}

async function photoPermalink(
  id: string,
  accessToken: string
): Promise<string | null> {
  try {
    const body = await graphRequest<{ link?: string }>(
      id,
      { fields: 'link' },
      accessToken
    );
    return body.link ?? null;
  } catch {
    return null;
  }
}

async function uploadPagePhoto(
  pageId: string,
  accessToken: string,
  image: PublishImage
): Promise<string> {
  if ('base64' in image) {
    const result = await graphPost<{ id: string }>(
      `${pageId}/photos`,
      { published: 'false' },
      accessToken,
      {
        bytes: Buffer.from(image.base64, 'base64'),
        type: image.type,
        filename: image.filename,
      }
    );
    return result.id;
  }

  const result = await graphPost<{ id: string }>(
    `${pageId}/photos`,
    { published: 'false', url: image.url },
    accessToken
  );
  return result.id;
}

export async function publishPagePost({
  pageId,
  accessToken,
  message,
  images = [],
}: {
  pageId: string;
  accessToken: string;
  message: string;
  images?: PublishImage[];
}): Promise<PublishedPost> {
  if (images.length > 1) {
    const mediaIds: string[] = [];
    for (const image of images) {
      mediaIds.push(await uploadPagePhoto(pageId, accessToken, image));
    }

    const fields: Record<string, string> = { message };
    mediaIds.forEach((id, index) => {
      fields[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
    });

    const result = await graphPost<{ id: string }>(
      `${pageId}/feed`,
      fields,
      accessToken
    );
    return {
      id: result.id,
      permalink: await postPermalink(result.id, accessToken),
    };
  }

  const image = images[0];
  if (image && 'base64' in image) {
    const result = await graphPost<{ id: string }>(
      `${pageId}/photos`,
      { caption: message, published: 'true' },
      accessToken,
      {
        bytes: Buffer.from(image.base64, 'base64'),
        type: image.type,
        filename: image.filename,
      }
    );
    return { id: result.id, permalink: await photoPermalink(result.id, accessToken) };
  }

  if (image && 'url' in image) {
    const result = await graphPost<{ id: string }>(
      `${pageId}/photos`,
      { caption: message, url: image.url, published: 'true' },
      accessToken
    );
    return { id: result.id, permalink: await photoPermalink(result.id, accessToken) };
  }

  const result = await graphPost<{ id: string }>(
    `${pageId}/feed`,
    { message },
    accessToken
  );
  return { id: result.id, permalink: await postPermalink(result.id, accessToken) };
}

export type ReelVideo = {
  bytes: Buffer;
  type: string;
  filename: string;
};

export async function publishPageReel({
  pageId,
  accessToken,
  caption,
  video,
  scheduledPublishTime = null,
}: {
  pageId: string;
  accessToken: string;
  caption: string;
  video: ReelVideo;
  scheduledPublishTime?: number | null;
}): Promise<PublishedPost> {
  const session = await graphPost<{ video_id?: string; upload_url?: string }>(
    `${pageId}/video_reels`,
    { upload_phase: 'start' },
    accessToken
  );

  if (!session.video_id || !session.upload_url) {
    throw new FacebookApiError('Facebook did not return a Reel upload session.');
  }

  let upload: Response;
  try {
    upload = await fetch(session.upload_url, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        offset: '0',
        file_size: String(video.bytes.length),
        'content-type': 'application/octet-stream',
      },
      body: toArrayBuffer(video.bytes),
      cache: 'no-store',
      signal: AbortSignal.timeout(REEL_UPLOAD_TIMEOUT_MS),
    });
  } catch {
    throw new FacebookApiError('The video upload to Facebook failed.');
  }

  const uploadBody = (await upload.json().catch(() => null)) as
    | GraphErrorBody
    | null;
  if (!upload.ok || uploadBody?.error) {
    throw new FacebookApiError(
      uploadBody?.error?.message ??
        `Facebook rejected the video upload (${upload.status}).`,
      uploadBody?.error?.code
    );
  }

  const finish = await graphPost<{ post_id?: string }>(
    `${pageId}/video_reels`,
    {
      upload_phase: 'finish',
      video_id: session.video_id,
      video_state: scheduledPublishTime ? 'SCHEDULED' : 'PUBLISHED',
      ...(scheduledPublishTime
        ? { scheduled_publish_time: String(scheduledPublishTime) }
        : {}),
      ...(caption ? { description: caption } : {}),
    },
    accessToken
  );

  return {
    id: finish.post_id ?? session.video_id,
    permalink: `https://www.facebook.com/reel/${session.video_id}`,
  };
}

export function redactTokens(message: string): string {
  return message
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/fb_exchange_token=[^&\s]+/gi, 'fb_exchange_token=[redacted]')
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[redacted]');
}
