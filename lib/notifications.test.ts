import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import {
  clearNotificationsByDedupeKey,
  kindComposerPath,
  kindLabel,
  notifyWorkspace,
  scheduledOutcomeCopy,
} from "./notifications";
import {
  NOTIFICATION_META,
  notificationSeverity,
} from "./notification-meta";

const sqlMock = sql as unknown as Mock;

beforeEach(() => {
  sqlMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NOTIFICATION_META", () => {
  it("covers every notification type the writers emit", () => {
    const emittedTypes = [
      "scheduled_publish_success",
      "scheduled_publish_failed",
      "publish_failed",
      "crosspost_partial_failure",
      "facebook_token_invalid",
      "facebook_reconnected",
      "facebook_oauth_failed",
    ];
    for (const type of emittedTypes) {
      expect(NOTIFICATION_META[type as keyof typeof NOTIFICATION_META])
        .toBeDefined();
    }
  });

  it("maps every severity to a known value", () => {
    const valid = new Set(["success", "error", "warning", "info"]);
    for (const meta of Object.values(NOTIFICATION_META)) {
      expect(valid.has(meta.severity)).toBe(true);
    }
  });

  it("falls back to info for unknown types", () => {
    expect(notificationSeverity("something_new")).toBe("info");
    expect(notificationSeverity("scheduled_publish_failed")).toBe("error");
  });
});

describe("kindLabel / kindComposerPath for platform kinds", () => {
  it("labels and routes the non-Facebook publish kinds", () => {
    expect(kindLabel("instagram-post")).toBe("Instagram post");
    expect(kindLabel("instagram-reel")).toBe("Instagram reel");
    expect(kindLabel("youtube-video")).toBe("YouTube video");
    expect(kindLabel("tiktok-video")).toBe("TikTok video");
    expect(kindComposerPath("youtube-video")).toBe("/youtube");
    expect(kindComposerPath("tiktok-video")).toBe("/tiktok");
    expect(kindComposerPath("instagram-reel")).toBe("/instagram");
  });

  it("keeps unknown kinds falling back like before", () => {
    expect(kindLabel("banner")).toBe("post");
    expect(kindComposerPath("banner")).toBeNull();
  });
});

describe("scheduledOutcomeCopy", () => {
  it("titles successes and failures per kind", () => {
    expect(scheduledOutcomeCopy("reel", true).title).toBe(
      "Scheduled reel published"
    );
    expect(scheduledOutcomeCopy("video", false).title).toBe(
      "Scheduled video failed to publish"
    );
  });

  it("falls back to post for unknown kinds", () => {
    expect(scheduledOutcomeCopy(null, true).title).toBe(
      "Scheduled post published"
    );
    expect(scheduledOutcomeCopy("banner", false).title).toBe(
      "Scheduled post failed to publish"
    );
  });

  it("keeps the error message as the failure body", () => {
    const copy = scheduledOutcomeCopy("post", false, "FB rejected the post.");
    expect(copy.body).toBe("FB rejected the post.");
  });

  it("uses a retry hint when a failure has no detail", () => {
    expect(scheduledOutcomeCopy("post", false).body).toContain("Calendar");
  });

  it("truncates long post text for the success body", () => {
    const copy = scheduledOutcomeCopy("post", true, "x".repeat(200));
    expect(copy.body).not.toBeNull();
    expect(copy.body!.length).toBeLessThanOrEqual(140);
    expect(copy.body!.endsWith("…")).toBe(true);
  });
});

describe("kindLabel / kindComposerPath", () => {
  it("labels every publishable kind", () => {
    expect(kindLabel("photo")).toBe("photo post");
    expect(kindLabel("live")).toBe("live stream");
    expect(kindLabel(undefined)).toBe("post");
  });

  it("maps kinds to their composer routes", () => {
    expect(kindComposerPath("reel")).toBe("/reels");
    expect(kindComposerPath("mystery")).toBeNull();
  });
});

describe("notifyWorkspace", () => {
  function members(members: { user_id: string }[]) {
    sqlMock.mockResolvedValueOnce(members);
    return members;
  }

  it("inserts one row per member and prunes old rows", async () => {
    members([{ user_id: "u1" }, { user_id: "u2" }]);
    sqlMock.mockResolvedValue([]); // inserts + prune

    await notifyWorkspace({
      workspaceId: "ws_1",
      type: "scheduled_publish_success",
      title: "Scheduled reel published",
      body: "Great news",
      link: "/calendar?post=7",
    });

    // 1 member lookup + 2 inserts + 1 prune
    expect(sqlMock.mock.calls).toHaveLength(4);

    const insert = sqlMock.mock.calls[1];
    const values = insert.slice(1);
    expect(values).toContain("u1");
    expect(values).toContain("scheduled_publish_success");
    expect(values).toContain("/calendar?post=7");

    const insert2 = sqlMock.mock.calls[2];
    expect(insert2.slice(1)).toContain("u2");

    expect(String(sqlMock.mock.calls[3][0])).toContain("DELETE FROM notifications");
  });

  it("excludes the actor from recipients", async () => {
    members([{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }]);
    sqlMock.mockResolvedValue([]);

    await notifyWorkspace({
      workspaceId: "ws_1",
      type: "publish_failed",
      title: "Post could not be published",
      excludeUserIds: ["u2"],
    });

    // 1 member lookup + 2 inserts + 1 prune
    expect(sqlMock.mock.calls).toHaveLength(4);
    const inserts = sqlMock.mock.calls.slice(1, 3);
    const recipients = inserts.map((call) => call.slice(1)[1]);
    expect(recipients).toEqual(["u1", "u3"]);
  });

  it("passes the dedupe key so unread duplicates collapse", async () => {
    members([{ user_id: "u1" }]);
    sqlMock.mockResolvedValue([]);

    await notifyWorkspace({
      workspaceId: "ws_1",
      type: "facebook_token_invalid",
      title: "Facebook Page needs reconnecting",
      dedupeKey: "facebook-token-invalid",
    });

    expect(sqlMock.mock.calls[1].slice(1)).toContain("facebook-token-invalid");
  });

  it("never throws when the database is unreachable", async () => {
    sqlMock.mockRejectedValue(new Error("connection refused"));

    await expect(
      notifyWorkspace({
        workspaceId: "ws_1",
        type: "publish_failed",
        title: "Post could not be published",
      })
    ).resolves.toBeUndefined();

    const logged = String(vi.mocked(console.error).mock.calls[0][0]);
    expect(logged).toContain('"notifications"');
    expect(logged).toContain("connection refused");
  });
});

describe("clearNotificationsByDedupeKey", () => {
  it("deletes unread rows for the workspace", async () => {
    sqlMock.mockResolvedValue([]);
    await clearNotificationsByDedupeKey("ws_1", "facebook-token-invalid");

    const [query, workspaceId, dedupeKey] = sqlMock.mock.calls[0];
    expect(String(query)).toContain("DELETE FROM notifications");
    expect(workspaceId).toBe("ws_1");
    expect(dedupeKey).toBe("facebook-token-invalid");
  });

  it("swallows database failures", async () => {
    sqlMock.mockRejectedValue(new Error("boom"));
    await expect(
      clearNotificationsByDedupeKey("ws_1", "facebook-token-invalid")
    ).resolves.toBeUndefined();
  });
});
