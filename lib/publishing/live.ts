import { graphPostForm, graphRequest } from '@/lib/facebook';

type RawLiveVideo = {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  stream_url?: string;
  secure_stream_url?: string;
  permalink_url?: string;
  planned_start_time?: string;
};

export type LiveVideo = {
  id: string;
  title: string;
  description: string;
  status: string;
  streamUrl: string | null;
  secureStreamUrl: string | null;
  permalink: string | null;
  plannedStartTime: string | null;
};

function mapLiveVideo(body: RawLiveVideo, fallbackId = ''): LiveVideo {
  return {
    id: body.id ?? fallbackId,
    title: body.title ?? 'Untitled live stream',
    description: body.description ?? '',
    status: body.status ?? 'UNKNOWN',
    streamUrl: body.stream_url ?? null,
    secureStreamUrl: body.secure_stream_url ?? null,
    permalink: body.permalink_url ?? null,
    plannedStartTime: body.planned_start_time ?? null,
  };
}

export async function createPageLiveVideo({
  pageId,
  accessToken,
  title,
  description = '',
  plannedStartTime = null,
}: {
  pageId: string;
  accessToken: string;
  title: string;
  description?: string;
  plannedStartTime?: number | null;
}): Promise<LiveVideo> {
  const fields: Record<string, string> = {
    title,
    status: plannedStartTime ? 'UNPUBLISHED' : 'LIVE_NOW',
  };
  if (description) fields.description = description;
  if (plannedStartTime) {
    fields.planned_start_time = String(plannedStartTime);
  }

  const body = await graphPostForm<RawLiveVideo>(
    `${pageId}/live_videos`,
    fields,
    accessToken
  );

  return mapLiveVideo(body);
}

export async function updatePageLiveVideo({
  liveVideoId,
  accessToken,
  title,
  description,
  plannedStartTime = null,
}: {
  liveVideoId: string;
  accessToken: string;
  title: string;
  description: string;
  plannedStartTime?: number | null;
}): Promise<LiveVideo> {
  const fields: Record<string, string> = { title, description };
  if (plannedStartTime) {
    fields.planned_start_time = String(plannedStartTime);
  }

  const body = await graphPostForm<RawLiveVideo>(
    liveVideoId,
    fields,
    accessToken
  );

  return mapLiveVideo(body, liveVideoId);
}

export async function endPageLiveVideo({
  liveVideoId,
  accessToken,
}: {
  liveVideoId: string;
  accessToken: string;
}): Promise<void> {
  await graphPostForm(
    liveVideoId,
    { end_live_video: 'true' },
    accessToken
  );
}

export async function fetchPageLiveVideo(
  liveVideoId: string,
  accessToken: string
): Promise<LiveVideo> {
  const body = await graphRequest<RawLiveVideo>(
    liveVideoId,
    {
      fields:
        'id,title,description,status,permalink_url,planned_start_time,stream_url,secure_stream_url',
    },
    accessToken
  );
  return mapLiveVideo(body, liveVideoId);
}

export type LiveComment = {
  id: string;
  message: string;
  author: string;
  createdTime: string | null;
};

export async function fetchLiveComments({
  liveVideoId,
  accessToken,
  after,
}: {
  liveVideoId: string;
  accessToken: string;
  after?: string | null;
}): Promise<{ comments: LiveComment[]; next: string | null }> {
  const params: Record<string, string> = {
    live_filter: 'no_filter',
    order: 'chronological',
    fields: 'id,message,created_time,from{id,name}',
    limit: '50',
  };
  if (after) params.after = after;

  const body = await graphRequest<{
    data?: {
      id: string;
      message?: string;
      created_time?: string;
      from?: { name?: string };
    }[];
    paging?: { cursors?: { after?: string } };
  }>(`${liveVideoId}/comments`, params, accessToken);

  return {
    comments: (body.data ?? []).map((comment) => ({
      id: comment.id,
      message: comment.message ?? '',
      author: comment.from?.name ?? 'Viewer',
      createdTime: comment.created_time ?? null,
    })),
    next: body.paging?.cursors?.after ?? null,
  };
}
