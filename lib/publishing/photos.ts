import {
  graphPostForm,
  graphRequest,
  type PublishImage,
} from '@/lib/facebook';
import { scheduledFields } from './schedule';

export type PhotoPublishResult = {
  id: string;
  permalink: string | null;
  mediaIds: string[];
};

type GraphFile = {
  bytes: Buffer;
  type: string;
  filename: string;
};

function imageFile(image: PublishImage): GraphFile | null {
  if (!('base64' in image)) return null;
  return {
    bytes: Buffer.from(image.base64, 'base64'),
    type: image.type,
    filename: image.filename,
  };
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

async function uploadUnattachedPhoto(
  pageId: string,
  accessToken: string,
  image: PublishImage
): Promise<string> {
  const file = imageFile(image);
  const fields: Record<string, string> = { published: 'false' };
  if (!file && 'url' in image) fields.url = image.url;

  const result = await graphPostForm<{ id: string }>(
    `${pageId}/photos`,
    fields,
    accessToken,
    file ? [{ field: 'source', ...file }] : []
  );
  return result.id;
}

async function publishSinglePhoto({
  pageId,
  accessToken,
  message,
  image,
  scheduledPublishTime,
}: {
  pageId: string;
  accessToken: string;
  message: string;
  image: PublishImage;
  scheduledPublishTime: number | null;
}): Promise<PhotoPublishResult> {
  const file = imageFile(image);
  const fields: Record<string, string> = {
    caption: message,
    ...scheduledFields(scheduledPublishTime),
  };
  if (!scheduledPublishTime) fields.published = 'true';
  if (!file && 'url' in image) fields.url = image.url;

  const result = await graphPostForm<{ id: string }>(
    `${pageId}/photos`,
    fields,
    accessToken,
    file ? [{ field: 'source', ...file }] : []
  );

  return {
    id: result.id,
    permalink: await photoPermalink(result.id, accessToken),
    mediaIds: [result.id],
  };
}

export async function publishPhotoPost({
  pageId,
  accessToken,
  message,
  images,
  scheduledPublishTime = null,
}: {
  pageId: string;
  accessToken: string;
  message: string;
  images: PublishImage[];
  scheduledPublishTime?: number | null;
}): Promise<PhotoPublishResult> {
  if (!images.length) {
    throw new Error('Choose at least one image.');
  }

  if (images.length === 1) {
    return publishSinglePhoto({
      pageId,
      accessToken,
      message,
      image: images[0],
      scheduledPublishTime,
    });
  }

  const mediaIds: string[] = [];
  for (const image of images) {
    mediaIds.push(await uploadUnattachedPhoto(pageId, accessToken, image));
  }

  const fields: Record<string, string> = {
    message,
    ...scheduledFields(scheduledPublishTime),
  };
  mediaIds.forEach((id, index) => {
    fields[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
  });

  const result = await graphPostForm<{ id: string }>(
    `${pageId}/feed`,
    fields,
    accessToken
  );

  return {
    id: result.id,
    permalink: await postPermalink(result.id, accessToken),
    mediaIds,
  };
}

export type PageAlbum = {
  id: string;
  name: string;
  count: number | null;
  createdTime: string | null;
  link: string | null;
};

export async function listPageAlbums(
  pageId: string,
  accessToken: string
): Promise<PageAlbum[]> {
  const body = await graphRequest<{
    data?: {
      id: string;
      name?: string;
      count?: number;
      created_time?: string;
      link?: string;
    }[];
  }>(
    `${pageId}/albums`,
    { fields: 'id,name,count,created_time,link', limit: '100' },
    accessToken
  );

  return (body.data ?? []).map((album) => ({
    id: album.id,
    name: album.name ?? 'Untitled album',
    count: typeof album.count === 'number' ? album.count : null,
    createdTime: album.created_time ?? null,
    link: album.link ?? null,
  }));
}

export async function createPageAlbum({
  pageId,
  accessToken,
  name,
  description = '',
}: {
  pageId: string;
  accessToken: string;
  name: string;
  description?: string;
}): Promise<{ id: string; permalink: string | null }> {
  const fields: Record<string, string> = { name };
  if (description) fields.message = description;

  const result = await graphPostForm<{ id: string }>(
    `${pageId}/albums`,
    fields,
    accessToken
  );

  let permalink: string | null = null;
  try {
    const album = await graphRequest<{ link?: string }>(
      result.id,
      { fields: 'link' },
      accessToken
    );
    permalink = album.link ?? null;
  } catch {
    // The album exists even when its permalink cannot be read.
  }

  return { id: result.id, permalink };
}

export async function addPhotosToAlbum({
  pageId,
  accessToken,
  albumId,
  message,
  images,
}: {
  pageId: string;
  accessToken: string;
  albumId: string;
  message: string;
  images: PublishImage[];
}): Promise<PhotoPublishResult> {
  if (!images.length) {
    throw new Error('Choose at least one image.');
  }

  const mediaIds: string[] = [];
  for (const [index, image] of images.entries()) {
    const file = imageFile(image);
    const fields: Record<string, string> = {
      album_id: albumId,
      published: 'true',
    };
    if (index === 0 && message) fields.message = message;
    if (!file && 'url' in image) fields.url = image.url;

    const result = await graphPostForm<{ id: string }>(
      `${pageId}/photos`,
      fields,
      accessToken,
      file ? [{ field: 'source', ...file }] : []
    );
    mediaIds.push(result.id);
  }

  return {
    id: albumId,
    permalink: `https://www.facebook.com/media/set/?set=a.${albumId}`,
    mediaIds,
  };
}
