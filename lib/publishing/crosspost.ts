import { NextResponse } from 'next/server';
import { FacebookApiError, redactTokens } from '@/lib/facebook';
import {
  kindComposerPath,
  kindLabel,
  notifyTokenInvalid,
  notifyWorkspace,
} from '@/lib/notifications';
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

/** Workspace + actor context, so publish outcomes reach the notification bell. */
export type CrosspostNotifyContext = {
  workspaceId: string;
  actorUserId: string;
  kind?: string | null;
};

/** Body copy stays one line in the bell panel. */
function clampDetail(text: string, max = 200) {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function firstFailure(results: CrosspostResult[]) {
  return results.find((result) => !result.ok) ?? null;
}

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
      if (
        error instanceof FacebookApiError &&
        (error.code === 10 || error.code === 200 || error.code === 190)
      ) {
        await notifyTokenInvalid(workspaceId);
      }
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

/**
 * Builds the shared composer response. Pass `notify` to also record a
 * notification for publish failures — every member sees them in the bell,
 * actor included, so failed posts stay visible once the toast is gone.
 */
export async function crosspostResponse(
  results: CrosspostResult[],
  extra: Record<string, unknown> = {},
  notify?: CrosspostNotifyContext
): Promise<NextResponse> {
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
    if (notify) {
      await notifyWorkspace({
        workspaceId: notify.workspaceId,
        type: 'publish_failed',
        title: `${kindLabel(notify.kind)} could not be published`,
        body: clampDetail(
          firstFailure(results)?.error ??
            'Facebook rejected the post on every selected Page.'
        ),
        link: kindComposerPath(notify.kind),
      });
    }
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
  if (partial && notify) {
    const failed = firstFailure(results);
    const failedCount = results.filter((result) => !result.ok).length;
    await notifyWorkspace({
      workspaceId: notify.workspaceId,
      type: 'crosspost_partial_failure',
      title: `${kindLabel(notify.kind)} published with Page failures`,
      body: clampDetail(
        `${failedCount} of ${results.length} Pages failed${
          failed ? `: ${failed.page.name} — ${failed.error}` : ''
        }`
      ),
      link: kindComposerPath(notify.kind),
    });
  }

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

// ---------------------------------------------------------------------------
// Single-account publishing (Instagram / YouTube / TikTok). Facebook fans out
// to Pages; every other platform publishes to exactly one account per
// workspace, so the executor wraps one call instead of a loop.
// ---------------------------------------------------------------------------

export type AccountTarget = {
  platform: string;
  id: string;
  name: string;
  accessToken: string;
};

export type AccountPublishResult = PagePublishResult;

export type AccountOutcome = {
  ok: boolean;
  id?: string;
  permalink?: string | null;
  error?: string;
  /** Token/auth rejection per the caller's classifier — routes map this to a reconnect hint. */
  rejected?: boolean;
};

/** Provider-specific classifiers mark rejected grants (401/403/190-class). */
export type TokenRejection = (error: unknown) => boolean;

/**
 * Runs one publish attempt against the account. Pass workspaceId + kind to
 * record failures in the notification bell (actor included) so lost toasts
 * surface later, same contract as crosspostResponse.
 */
export async function publishToAccount({
  account,
  publish,
  workspaceId,
  kind,
  isTokenRejection,
}: {
  account: AccountTarget;
  publish: (account: AccountTarget) => Promise<AccountPublishResult>;
  workspaceId?: string;
  kind?: string | null;
  isTokenRejection?: TokenRejection;
}): Promise<AccountOutcome> {
  try {
    const result = await publish(account);
    return {
      ok: true,
      id: result.id,
      permalink: result.permalink,
    };
  } catch (error) {
    const message = redactTokens(
      error instanceof Error ? error.message : 'The platform rejected the post.'
    );
    if (workspaceId) {
      await notifyWorkspace({
        workspaceId,
        type: 'publish_failed',
        title: `${kindLabel(kind)} could not be published`,
        body: clampDetail(message),
        link: kindComposerPath(kind),
      });
    }
    return {
      ok: false,
      error: message,
      ...(workspaceId && isTokenRejection?.(error)
        ? { rejected: true }
        : {}),
    };
  }
}
