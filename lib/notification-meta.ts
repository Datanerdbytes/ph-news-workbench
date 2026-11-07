/**
 * Client-safe notification metadata — no database imports, so the bell
 * component can import it directly.
 */

export type NotificationType =
  | "scheduled_publish_success"
  | "scheduled_publish_failed"
  | "publish_failed"
  | "crosspost_partial_failure"
  | "facebook_token_invalid"
  | "facebook_reconnected"
  | "facebook_oauth_failed";

export type NotificationSeverity = "success" | "error" | "warning" | "info";

/** Shared type → severity map, so the bell's toasts and icons stay in sync. */
export const NOTIFICATION_META: Record<
  NotificationType,
  { severity: NotificationSeverity }
> = {
  scheduled_publish_success: { severity: "success" },
  scheduled_publish_failed: { severity: "error" },
  publish_failed: { severity: "error" },
  crosspost_partial_failure: { severity: "warning" },
  facebook_token_invalid: { severity: "error" },
  facebook_reconnected: { severity: "success" },
  facebook_oauth_failed: { severity: "warning" },
};

export function notificationSeverity(type: string): NotificationSeverity {
  return NOTIFICATION_META[type as NotificationType]?.severity ?? "info";
}
