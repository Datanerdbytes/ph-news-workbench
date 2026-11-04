import { graphPostForm, graphRequest } from '@/lib/facebook';
import { scheduledFields } from './schedule';

export type TextPostResult = {
  id: string;
  permalink: string | null;
};

export async function publishTextPost({
  pageId,
  accessToken,
  message,
  link = '',
  scheduledPublishTime = null,
}: {
  pageId: string;
  accessToken: string;
  message: string;
  link?: string;
  scheduledPublishTime?: number | null;
}): Promise<TextPostResult> {
  const fields: Record<string, string> = {
    message,
    ...scheduledFields(scheduledPublishTime),
  };
  if (link) fields.link = link;

  const result = await graphPostForm<{ id: string }>(
    `${pageId}/feed`,
    fields,
    accessToken
  );

  let permalink: string | null = null;
  try {
    const body = await graphRequest<{ permalink_url?: string }>(
      result.id,
      { fields: 'permalink_url' },
      accessToken
    );
    permalink = body.permalink_url ?? null;
  } catch {
    // The post exists even when its permalink cannot be read.
  }

  return { id: result.id, permalink };
}
