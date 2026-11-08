import { NextResponse } from 'next/server';
import { stripMarkdown } from '@/lib/format';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { assertStagedBlob } from '@/lib/blob';
import {
  publishInstagramImagePost,
  resolveInstagramAccount,
} from '@/lib/publishing/instagram';
import { instagramErrorResponse } from '@/lib/publishing/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const workspaceId = access.workspace.id;
  const connection = await resolveInstagramAccount(workspaceId);
  if (!connection.ok) {
    if (connection.reason === 'not_connected') {
      return NextResponse.json(
        {
          error:
            'Connect your Facebook Page with Instagram permissions before posting to Instagram.',
          code: 'not_connected',
        },
        { status: 409 }
      );
    }
    if (connection.reason === 'scope_missing') {
      return NextResponse.json(
        {
          error: `Reconnect to grant ${connection.detail ?? 'the Instagram scopes'} before posting.`,
          code: 'scope_missing',
        },
        { status: 403 }
      );
    }
    if (connection.reason === 'no_ig_account') {
      return NextResponse.json(
        {
          error:
            connection.detail ??
            'This Page has no professional Instagram account linked to it.',
          code: 'no_ig_account',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: `Could not verify the Instagram connection${
          connection.detail ? `: ${connection.detail}` : '.'
        }`,
        code: 'probe_failed',
      },
      { status: 502 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    imageUrl?: unknown;
  } | null;
  const caption = stripMarkdown(
    typeof body?.message === 'string' ? body.message : ''
  ).slice(0, 2200);
  const imageUrl =
    typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';

  if (!imageUrl) {
    return NextResponse.json(
      { error: 'Choose an image to publish.' },
      { status: 400 }
    );
  }
  // Only freshly staged workbench blobs may be handed to Instagram — the
  // fetch happens from Meta's side, so stray URLs must never pass through.
  if (!imageUrl.startsWith(`${process.env.NEXT_PUBLIC_BLOB_ROOT ?? 'https://'}`) || !imageUrl.includes('.public.blob.vercel-storage.com')) {
    return NextResponse.json(
      { error: 'The image is not a staged workbench upload.' },
      { status: 400 }
    );
  }
  try {
    await assertStagedBlob(imageUrl);
  } catch {
    return NextResponse.json(
      { error: 'The image could not be verified against staged uploads.' },
      { status: 400 }
    );
  }

  try {
    const result = await publishInstagramImagePost({
      account: connection.account,
      accessToken: connection.accessToken,
      imageUrl,
      caption,
    });

    return NextResponse.json(
      {
        id: result.id,
        permalink: result.permalink,
        account: {
          id: connection.account.id,
          name: connection.account.username,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return instagramErrorResponse(
      error,
      'publish_failed',
      'Instagram rejected the post.',
      { workspaceId, kind: 'instagram-post' }
    );
  }
}
