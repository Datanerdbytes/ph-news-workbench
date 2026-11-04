import { NextResponse } from 'next/server';
import { redactTokens } from '@/lib/facebook';
import { resolvePageTargets, type PageTarget } from './connection';

export type PagePublishResult = {
  id: string;
  permalink: string | null;
};

export type CrosspostResult = {
  page: { id: string; name: string };
  ok: boolean;
  id?: string;
  permalink?: string | null;
  error?: string;
};

export async function publishToSelectedPages({
  workspaceId,
  pageIds,
  publish,
}: {
  workspaceId: string;
  pageIds: string[];
  publish: (page: PageTarget) => Promise<PagePublishResult>;
}): Promise<{ targets: PageTarget[]; results: CrosspostResult[] }> {
  const targets = await resolvePageTargets(workspaceId, pageIds);

  if (pageIds.length && !targets.length) {
    throw new Error(
      'None of the selected Pages are still connected. Reconnect Facebook and try again.'
    );
  }

  const results: CrosspostResult[] = [];
  for (const target of targets) {
    try {
      const result = await publish(target);
      results.push({
        page: { id: target.id, name: target.name },
        ok: true,
        id: result.id,
        permalink: result.permalink,
      });
    } catch (error) {
      results.push({
        page: { id: target.id, name: target.name },
        ok: false,
        error: redactTokens(
          error instanceof Error ? error.message : 'Facebook rejected the post.'
        ),
      });
    }
  }

  return { targets, results };
}

export function firstSuccess(results: CrosspostResult[]) {
  return results.find((result) => result.ok) ?? null;
}

export function crosspostResponse(
  results: CrosspostResult[],
  extra: Record<string, unknown> = {}
): NextResponse {
  if (!results.length) {
    return NextResponse.json(
      {
        error: 'No connected Pages were selected.',
        code: 'no_pages',
        results,
        ...extra,
      },
      { status: 400 }
    );
  }

  const success = firstSuccess(results);
  if (!success) {
    return NextResponse.json(
      {
        error:
          results[0]?.error ??
          'Facebook rejected the post on every selected Page.',
        code: 'publish_failed',
        results,
        ...extra,
      },
      { status: 502 }
    );
  }

  const partial = results.some((result) => !result.ok);
  return NextResponse.json(
    {
      id: success.id,
      permalink: success.permalink,
      page: success.page,
      results,
      ...(partial
        ? {
            warning: `${results.filter((result) => !result.ok).length} of ${results.length} Pages failed.`,
          }
        : {}),
      ...extra,
    },
    { status: partial ? 207 : 201 }
  );
}
