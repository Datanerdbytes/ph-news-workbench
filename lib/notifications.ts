import { sql } from "@/lib/db";
import type { NotificationType } from "@/lib/notification-meta";

export {
  NOTIFICATION_META,
  notificationSeverity,
} from "@/lib/notification-meta";
export type { NotificationType, NotificationSeverity } from "@/lib/notification-meta";

/** Unread rows sharing a workspace + dedupe key collapse into one insert. */
export const TOKEN_INVALID_DEDUPE_KEY = "facebook-token-invalid";

type NotifyWorkspaceInput = {
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
  /** Actors who already saw the outcome live (they fired the request). */
  excludeUserIds?: string[];
};

/**
 * Fan a notification out to every member of a workspace, one row per user so
 * read state stays per-user. Never throws — notifications are a side effect
 * and must not break the publishing path (same contract as recordScheduleEvent).
 */
export async function notifyWorkspace(input: NotifyWorkspaceInput) {
  try {
    const members = (await sql`
      SELECT user_id FROM workspace_members
      WHERE workspace_id = ${input.workspaceId}`) as unknown as {
      user_id: string;
    }[];

    const excluded = new Set(input.excludeUserIds ?? []);
    const recipients = members
      .map((member) => member.user_id)
      .filter((userId) => !excluded.has(userId));

    for (const userId of recipients) {
      await sql`
        INSERT INTO notifications
          (workspace_id, user_id, type, title, body, link, dedupe_key)
        VALUES
          (${input.workspaceId}, ${userId}, ${input.type}, ${input.title},
           ${input.body ?? null}, ${input.link ?? null}, ${input.dedupeKey ?? null})
        ON CONFLICT (workspace_id, dedupe_key)
          WHERE dedupe_key IS NOT NULL AND read_at IS NULL
        DO NOTHING`;
    }

    // Opportunistic retention — keep the bell from growing without bound.
    await sql`
      DELETE FROM notifications
      WHERE workspace_id = ${input.workspaceId}
        AND created_at < now() - interval '30 days'`;
  } catch (error) {
    console.error(
      JSON.stringify({
        route: "notifications",
        event: "failed",
        workspaceId: input.workspaceId,
        notificationType: input.type,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/**
 * Drop unread notifications for a resolved condition — reconnecting clears
 * every outstanding "token invalid" row, for all members at once.
 */
export async function clearNotificationsByDedupeKey(
  workspaceId: string,
  dedupeKey: string
) {
  try {
    await sql`
      DELETE FROM notifications
      WHERE workspace_id = ${workspaceId} AND dedupe_key = ${dedupeKey}
        AND read_at IS NULL`;
  } catch (error) {
    console.error(
      JSON.stringify({
        route: "notifications",
        event: "clear_failed",
        workspaceId,
        dedupeKey,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/**
 * Facebook rejected the Page token/permissions (codes 10/200/190) — one
 * workspace-wide notification, deduped until the Pages are reconnected.
 */
export function notifyTokenInvalid(workspaceId: string) {
  return notifyWorkspace({
    workspaceId,
    type: "facebook_token_invalid",
    title: "Facebook Page needs reconnecting",
    body: "Publishing permissions were rejected. Reconnect the Page in Settings to keep publishing.",
    link: "/settings",
    dedupeKey: TOKEN_INVALID_DEDUPE_KEY,
  });
}

/**
 * A composer submit that our limits or Facebook rejected, before any
 * scheduled row exists to track it — record it for the whole workspace,
 * actor included, so failed posts stay visible once the toast is gone.
 */
export function notifyPublishAttemptFailure({
  workspaceId,
  kind,
  reason,
}: {
  workspaceId: string;
  kind?: string | null;
  reason: string;
}) {
  return notifyWorkspace({
    workspaceId,
    type: "publish_failed",
    title: `${kindLabel(kind)} could not be published`,
    body: snippet(reason, 200),
    link: kindComposerPath(kind),
  });
}

const KIND_LABELS: Record<string, string> = {
  post: "post",
  photo: "photo post",
  video: "video",
  reel: "reel",
  live: "live stream",
  story: "story",
  "instagram-post": "Instagram post",
  "instagram-reel": "Instagram reel",
  "youtube-video": "YouTube video",
  "tiktok-video": "TikTok video",
};

export function kindLabel(kind: string | null | undefined): string {
  return KIND_LABELS[kind ?? ""] ?? "post";
}

const KIND_COMPOSER_PATHS: Record<string, string> = {
  post: "/post",
  photo: "/photos",
  video: "/videos",
  reel: "/reels",
  story: "/stories",
  live: "/live",
  "instagram-post": "/instagram",
  "instagram-reel": "/instagram",
  "youtube-video": "/youtube",
  "tiktok-video": "/tiktok",
};

export function kindComposerPath(kind: string | null | undefined) {
  return KIND_COMPOSER_PATHS[kind ?? ""] ?? null;
}

/** Long post text becomes a one-line body, not a wall. */
function snippet(text: string | null | undefined, max = 140) {
  const value = (text ?? "").trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Shared copy for every scheduled-publish outcome, cron and native sync alike. */
export function scheduledOutcomeCopy(
  kind: string | null | undefined,
  published: boolean,
  detail?: string | null
): { title: string; body: string | null } {
  const label = kindLabel(kind);
  if (published) {
    return { title: `Scheduled ${label} published`, body: snippet(detail) };
  }
  return {
    title: `Scheduled ${label} failed to publish`,
    body:
      snippet(detail) ??
      "Facebook did not publish this item. Open the Calendar to retry.",
  };
}
