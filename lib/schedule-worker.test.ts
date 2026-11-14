import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/schedule-events", () => ({ recordScheduleEvent: vi.fn() }));
vi.mock("@/lib/facebook-page-token", () => ({
  getPrimaryPage: vi.fn(),
  resolvePageToken: vi.fn(),
}));
vi.mock("@/lib/facebook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/facebook")>();
  return {
    ...actual,
    publishPagePost: vi.fn(),
    isFacebookVideoPublished: vi.fn(),
    isFacebookPostPublished: vi.fn(),
    isFacebookLiveStarted: vi.fn(),
    isFacebookStillScheduled: vi.fn(),
  };
});
vi.mock("@/lib/publishing/connection", () => ({
  resolvePlatformAccount: vi.fn(),
}));
vi.mock("@/lib/publishing/instagram", () => ({
  publishInstagramImagePost: vi.fn(),
  resolveInstagramAccount: vi.fn(),
}));
vi.mock("@/lib/blob", () => ({ deleteStagedBlobs: vi.fn() }));
vi.mock("@/lib/youtube", () => ({
  ensureFreshYouTubeToken: vi.fn(),
  fetchYouTubeVideoStatus: vi.fn(),
}));

import { sql } from "@/lib/db";
import {
  FacebookApiError,
  isFacebookPostPublished,
  isFacebookStillScheduled,
  isFacebookVideoPublished,
  publishPagePost,
} from "@/lib/facebook";
import { getPrimaryPage, resolvePageToken } from "@/lib/facebook-page-token";
import { recordScheduleEvent } from "@/lib/schedule-events";
import { resolvePlatformAccount } from "@/lib/publishing/connection";
import {
  publishInstagramImagePost,
  resolveInstagramAccount,
} from "@/lib/publishing/instagram";
import { deleteStagedBlobs } from "@/lib/blob";
import {
  ensureFreshYouTubeToken,
  fetchYouTubeVideoStatus,
} from "@/lib/youtube";
import { publishDuePosts, syncNativeSchedules } from "./schedule-worker";

const sqlMock = sql as unknown as Mock;
const events = () =>
  vi.mocked(recordScheduleEvent).mock.calls.map((call) => call[0]);

/**
 * Dispatch mocked query results by their static SQL text: the claim query,
 * the stuck-publishing sweep, and the native-sync sweep each have a distinct
 * marker; every UPDATE returns nothing.
 */
function useDb(overrides: {
  claim?: unknown[];
  claimRow?: unknown[];
  stuck?: unknown[];
  native?: unknown[];
}) {
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("attempts = attempts + 1"))
      // Per-row conditional claim — succeeds unless the test overrides it.
      // attempts mirrors the fixture's pre-claim value + 1.
      return overrides.claimRow ?? [{ id: 1, attempts: 2 }];
    if (query.includes("source = 'local'")) return overrides.claim ?? [];
    if (query.includes("status = 'publishing'")) return overrides.stuck ?? [];
    if (query.includes("source IN ('facebook', 'youtube')"))
      return overrides.native ?? [];
    return [];
  });
}

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function claimedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspace_id: "ws1",
    news_item_id: null,
    draft_id: null,
    text: "hello",
    image_url: null,
    image_urls: null,
    attempts: 1,
    ...overrides,
  };
}

function nativeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspace_id: "ws1",
    news_item_id: null,
    kind: "post",
    source: "facebook",
    facebook_post_id: "fb_1",
    facebook_post_ids: null,
    page_id: "pg1",
    scheduled_for: minutesAgo(5),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useDb({});
});

describe("publishDuePosts", () => {
  it("publishes a due post and records claimed + published events", async () => {
    useDb({ claim: [claimedRow({ draft_id: 21 })] });
    vi.mocked(getPrimaryPage).mockResolvedValue({
      pageId: "pg1",
      token: "tok",
    });
    vi.mocked(publishPagePost).mockResolvedValue({
      id: "fb_1",
      permalink: null,
    });

    await expect(publishDuePosts({ source: "scheduler" })).resolves.toEqual({
      due: 1,
      published: 1,
      failed: 0,
      synced: 0,
    });

    expect(publishPagePost).toHaveBeenCalledWith({
      pageId: "pg1",
      accessToken: "tok",
      message: "hello",
      images: [],
    });
    expect(events().map((event) => event.event)).toEqual([
      "claimed",
      "published",
    ]);
    expect(events()[1]).toMatchObject({
      scheduledPostId: 1,
      facebookPostId: "fb_1",
      source: "scheduler",
    });

    const updateTexts = sqlMock.mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join(" ")
    );
    expect(
      updateTexts.some((text) => text.includes("SET status = 'published'"))
    ).toBe(true);
    expect(
      updateTexts.some((text) => text.includes("UPDATE drafts"))
    ).toBe(true);
  });

  it("requeues the post while attempts remain", async () => {
    // attempts is the pre-claim value; the per-row claim makes this the
    // second attempt.
    useDb({ claim: [claimedRow({ attempts: 1 })] });
    vi.mocked(getPrimaryPage).mockResolvedValue({
      pageId: "pg1",
      token: "tok",
    });
    vi.mocked(publishPagePost).mockRejectedValue(
      new FacebookApiError("token expired", 190)
    );

    await expect(publishDuePosts({ source: "scheduler" })).resolves.toMatchObject({
      published: 0,
      failed: 0,
    });
    expect(events().map((event) => event.event)).toEqual([
      "claimed",
      "retrying",
    ]);
    expect(events()[1]).toMatchObject({
      errorMessage: "token expired",
      metadata: { attempt: 2, maxAttempts: 3 },
    });
  });

  it("fails the post once the attempt budget is exhausted", async () => {
    // attempts is the pre-claim value — the per-row claim makes this the
    // third attempt, which is the last one.
    useDb({
      claim: [claimedRow({ attempts: 2 })],
      claimRow: [{ id: 1, attempts: 3 }], // the claim lands the third attempt
    });
    vi.mocked(getPrimaryPage).mockResolvedValue({
      pageId: "pg1",
      token: "tok",
    });
    vi.mocked(publishPagePost).mockRejectedValue(
      new FacebookApiError("token expired", 190)
    );

    await expect(publishDuePosts({ source: "scheduler" })).resolves.toMatchObject({
      published: 0,
      failed: 1,
    });
    expect(events().map((event) => event.event)).toEqual(["claimed", "failed"]);
  });

  it("skips a row another sweep already claimed", async () => {
    useDb({
      claim: [claimedRow()],
      claimRow: [], // the conditional claim updates nothing — contested
    });
    vi.mocked(getPrimaryPage).mockResolvedValue({
      pageId: "pg1",
      token: "tok",
    });

    await expect(publishDuePosts({ source: "scheduler" })).resolves.toMatchObject({
      due: 1,
      published: 0,
      failed: 0,
    });
    expect(publishPagePost).not.toHaveBeenCalled();
    expect(events()).toEqual([]);
  });

  it("redacts token material from Facebook error messages", async () => {
    useDb({ claim: [claimedRow()] });
    vi.mocked(getPrimaryPage).mockResolvedValue({
      pageId: "pg1",
      token: "tok",
    });
    vi.mocked(publishPagePost).mockRejectedValue(
      new FacebookApiError("failed: access_token=abc123", 190)
    );

    await publishDuePosts({ source: "scheduler" });
    expect(events()[1]).toMatchObject({
      errorMessage: "failed: access_token=[redacted]",
    });
  });

  it("reports a workspace with no connected page", async () => {
    useDb({ claim: [claimedRow()] });
    vi.mocked(getPrimaryPage).mockResolvedValue(null);

    await publishDuePosts({ source: "scheduler" });
    expect(events()[1]).toMatchObject({
      event: "retrying",
      errorMessage: "This workspace has no connected Facebook Page.",
    });
  });

  describe("scheduled Instagram posts", () => {
    const igImage =
      "https://bucket.public.blob.vercel-storage.com/instagram/img.jpg";

    function instagramRow(overrides: Record<string, unknown> = {}) {
      return claimedRow({
        kind: "instagram-post",
        image_url: igImage,
        ...overrides,
      });
    }

    const igConnection = {
      ok: true as const,
      account: { id: "ig1", username: "iamwowie_", picture: null },
      accessToken: "page-token",
      scopes: ["instagram_content_publish"],
      pageId: "pg1",
    };

    beforeEach(() => {
      vi.mocked(resolveInstagramAccount).mockResolvedValue(igConnection);
      vi.mocked(publishInstagramImagePost).mockResolvedValue({
        id: "ig_media_1",
        permalink: "https://www.instagram.com/p/xyz",
      });
    });

    it("publishes via the container flow and deletes the staged image", async () => {
      useDb({ claim: [instagramRow({ draft_id: 31 })] });

      await expect(publishDuePosts({ source: "scheduler" })).resolves.toEqual({
        due: 1,
        published: 1,
        failed: 0,
        synced: 0,
      });

      expect(resolveInstagramAccount).toHaveBeenCalledWith("ws1");
      expect(publishInstagramImagePost).toHaveBeenCalledWith({
        account: igConnection.account,
        accessToken: "page-token",
        imageUrl: igImage,
        caption: "hello",
      });
      expect(deleteStagedBlobs).toHaveBeenCalledWith([igImage]);
      expect(events().map((event) => event.event)).toEqual([
        "claimed",
        "published",
      ]);
      expect(events()[1]).toMatchObject({
        event: "published",
        facebookPostId: "ig_media_1",
      });

      const updateTexts = sqlMock.mock.calls.map((call) =>
        (call[0] as TemplateStringsArray).join(" ")
      );
      expect(
        updateTexts.some((text) => text.includes("status = 'published'"))
      ).toBe(true);
      expect(
        updateTexts.some((text) => text.includes("UPDATE drafts"))
      ).toBe(true);
    });

    it("retries with the gate message when no Instagram account is linked", async () => {
      useDb({ claim: [instagramRow()] });
      vi.mocked(resolveInstagramAccount).mockResolvedValue({
        ok: false,
        reason: "no_ig_account",
        detail: "This Page has no professional Instagram account linked to it.",
      });

      await publishDuePosts({ source: "scheduler" });

      expect(publishInstagramImagePost).not.toHaveBeenCalled();
      expect(deleteStagedBlobs).not.toHaveBeenCalled();
      expect(events()[1]).toMatchObject({
        event: "retrying",
        errorMessage:
          "This Page has no professional Instagram account linked to it.",
      });
    });

    it("retries when Instagram refuses the publish", async () => {
      useDb({ claim: [instagramRow()] });
      vi.mocked(publishInstagramImagePost).mockRejectedValue(
        new Error("Instagram is still processing the image. Retry shortly.")
      );

      await publishDuePosts({ source: "scheduler" });

      expect(events()[1]).toMatchObject({
        event: "retrying",
        errorMessage: "Instagram is still processing the image. Retry shortly.",
      });
    });
  });
});

describe("syncNativeSchedules", () => {
  it("returns zero when no native rows are due", async () => {
    await expect(syncNativeSchedules()).resolves.toBe(0);
    expect(recordScheduleEvent).not.toHaveBeenCalled();
  });

  it("marks a post published when Facebook reports it live", async () => {
    useDb({ native: [nativeRow()] });
    vi.mocked(resolvePageToken).mockResolvedValue("tok");
    vi.mocked(isFacebookPostPublished).mockResolvedValue(true);

    await expect(syncNativeSchedules()).resolves.toBe(1);
    expect(events()[0]).toMatchObject({
      event: "published",
      facebookPostId: "fb_1",
      metadata: { kind: "post", executor: "facebook" },
    });
  });

  it("tries the next probe shape when one is inconclusive", async () => {
    useDb({ native: [nativeRow({ kind: "reel" })] });
    vi.mocked(resolvePageToken).mockResolvedValue("tok");
    vi.mocked(isFacebookVideoPublished).mockResolvedValue(null);
    vi.mocked(isFacebookPostPublished).mockResolvedValue(true);

    await expect(syncNativeSchedules()).resolves.toBe(1);
  });

  it("falls through to the next probe when one throws", async () => {
    useDb({ native: [nativeRow()] });
    vi.mocked(resolvePageToken).mockResolvedValue("tok");
    vi.mocked(isFacebookPostPublished).mockRejectedValue(
      new FacebookApiError("boom", 500)
    );
    vi.mocked(isFacebookVideoPublished).mockResolvedValue(true);

    await expect(syncNativeSchedules()).resolves.toBe(1);
  });

  it("infers publication from the scheduled_posts queue for containers", async () => {
    useDb({
      native: [nativeRow({ kind: "reel", scheduled_for: minutesAgo(5) })],
    });
    vi.mocked(resolvePageToken).mockResolvedValue("tok");
    vi.mocked(isFacebookVideoPublished).mockResolvedValue(null);
    vi.mocked(isFacebookPostPublished).mockResolvedValue(null);
    vi.mocked(isFacebookStillScheduled).mockResolvedValue(false);

    await expect(syncNativeSchedules()).resolves.toBe(1);
    expect(events()[0]).toMatchObject({
      event: "published",
      metadata: { executor: "facebook", viaQueue: true },
    });
  });

  it("fails items removed from the queue before their slot", async () => {
    useDb({
      native: [
        nativeRow({
          kind: "reel",
          scheduled_for: new Date(Date.now() + 5 * 60_000).toISOString(),
        }),
      ],
    });
    vi.mocked(resolvePageToken).mockResolvedValue("tok");
    vi.mocked(isFacebookVideoPublished).mockResolvedValue(null);
    vi.mocked(isFacebookPostPublished).mockResolvedValue(null);
    vi.mocked(isFacebookStillScheduled).mockResolvedValue(false);

    await expect(syncNativeSchedules()).resolves.toBe(1);
    expect(events()[0]).toMatchObject({
      event: "failed",
      errorMessage: "The item was removed from Facebook before its scheduled time.",
    });
  });

  it("leaves items Facebook is still holding", async () => {
    useDb({ native: [nativeRow({ kind: "reel" })] });
    vi.mocked(resolvePageToken).mockResolvedValue("tok");
    vi.mocked(isFacebookVideoPublished).mockResolvedValue(null);
    vi.mocked(isFacebookPostPublished).mockResolvedValue(null);
    vi.mocked(isFacebookStillScheduled).mockResolvedValue(true);

    await expect(syncNativeSchedules()).resolves.toBe(0);
    expect(recordScheduleEvent).not.toHaveBeenCalled();
  });

  it("fails items that stayed unpublished past their grace period", async () => {
    useDb({
      native: [
        nativeRow({
          page_id: null,
          scheduled_for: minutesAgo(3 * 60),
        }),
      ],
    });
    vi.mocked(resolvePageToken).mockResolvedValue("tok");
    vi.mocked(isFacebookPostPublished).mockResolvedValue(null);
    vi.mocked(isFacebookVideoPublished).mockResolvedValue(null);

    await expect(syncNativeSchedules()).resolves.toBe(1);
    expect(events()[0]).toMatchObject({
      event: "failed",
      errorMessage: "Facebook did not publish this item at its scheduled time.",
    });
  });

  it("reports rows without a Facebook id as failed without counting them", async () => {
    useDb({ native: [nativeRow({ facebook_post_id: null })] });

    await expect(syncNativeSchedules()).resolves.toBe(0);
    expect(events()[0]).toMatchObject({
      event: "failed",
      errorMessage: "Facebook did not return an id for this item.",
    });
  });

  describe("YouTube-scheduled videos", () => {
    function youtubeRow(overrides: Record<string, unknown> = {}) {
      return nativeRow({
        kind: "video",
        source: "youtube",
        facebook_post_id: "yt_video_1",
        page_id: "UC1",
        ...overrides,
      });
    }

    const connectedAccount = {
      platform: "youtube" as const,
      platformUserId: "UC1",
      username: "Neural-Verse",
      accessToken: "cipher-token",
      scopes: ["https://www.googleapis.com/auth/youtube.upload"],
      expiresAt: null,
    };

    beforeEach(() => {
      vi.mocked(resolvePlatformAccount).mockResolvedValue(connectedAccount);
      vi.mocked(ensureFreshYouTubeToken).mockResolvedValue("fresh-token");
    });

    it("marks the video published once YouTube flips it public", async () => {
      useDb({ native: [youtubeRow()] });
      vi.mocked(fetchYouTubeVideoStatus).mockResolvedValue({
        uploadStatus: "processed",
        thumbnail: null,
        privacyStatus: "public",
      });

      await expect(syncNativeSchedules()).resolves.toBe(1);
      expect(ensureFreshYouTubeToken).toHaveBeenCalledWith(
        connectedAccount,
        "ws1"
      );
      expect(fetchYouTubeVideoStatus).toHaveBeenCalledWith(
        "yt_video_1",
        "fresh-token"
      );
      expect(events()[0]).toMatchObject({
        event: "published",
        facebookPostId: "yt_video_1",
        metadata: { kind: "video", executor: "youtube" },
      });
    });

    it("leaves the row scheduled while the video is still private", async () => {
      useDb({ native: [youtubeRow()] });
      vi.mocked(fetchYouTubeVideoStatus).mockResolvedValue({
        uploadStatus: "processed",
        thumbnail: null,
        privacyStatus: "private",
      });

      await expect(syncNativeSchedules()).resolves.toBe(0);
      expect(events()).toEqual([]);
    });

    it("fails the row once it stays private past the grace period", async () => {
      useDb({
        native: [youtubeRow({ scheduled_for: minutesAgo(90) })],
      });
      vi.mocked(fetchYouTubeVideoStatus).mockResolvedValue({
        uploadStatus: "processed",
        thumbnail: null,
        privacyStatus: "private",
      });

      await expect(syncNativeSchedules()).resolves.toBe(1);
      expect(events()[0]).toMatchObject({
        event: "failed",
        errorMessage:
          "YouTube did not publish this video at its scheduled time.",
        metadata: { kind: "video", executor: "youtube" },
      });
    });

    it("keeps inconclusive probe results retryable and never fails on them", async () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      useDb({
        native: [youtubeRow({ scheduled_for: minutesAgo(90) })],
      });
      // Non-OK responses surface as null — the video may already be public.
      vi.mocked(fetchYouTubeVideoStatus).mockResolvedValue({
        uploadStatus: null,
        thumbnail: null,
        privacyStatus: null,
      });

      await expect(syncNativeSchedules()).resolves.toBe(0);
      expect(events()).toEqual([]);

      // The back-off marker bumps updated_at so the row skips the next
      // sweep instead of occupying the LIMIT 10 slot every run.
      const updateTexts = sqlMock.mock.calls.map((call) =>
        (call[0] as TemplateStringsArray).join(" ")
      );
      expect(
        updateTexts.some((text) => text.includes("SET updated_at = now()"))
      ).toBe(true);
      expect(errorSpy.mock.calls[0][0]).toContain("probe_failed");
    });

    it("backs off within the grace window when the probe errors", async () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      useDb({ native: [youtubeRow()] });
      vi.mocked(ensureFreshYouTubeToken).mockRejectedValue(
        new Error("Google could not be reached.")
      );

      await expect(syncNativeSchedules()).resolves.toBe(0);
      expect(events()).toEqual([]);

      const updateTexts = sqlMock.mock.calls.map((call) =>
        (call[0] as TemplateStringsArray).join(" ")
      );
      expect(
        updateTexts.some((text) => text.includes("SET updated_at = now()"))
      ).toBe(true);
      expect(errorSpy.mock.calls[0][0]).toContain("probe_failed");
    });

    it("fails a row it cannot probe once the grace window passes", async () => {
      useDb({
        native: [youtubeRow({ scheduled_for: minutesAgo(90) })],
      });
      vi.mocked(ensureFreshYouTubeToken).mockRejectedValue(
        new Error("Google could not be reached.")
      );

      await expect(syncNativeSchedules()).resolves.toBe(1);
      expect(events()[0]).toMatchObject({
        event: "failed",
        errorMessage:
          "YouTube could not be probed: Google could not be reached.",
        metadata: { kind: "video", executor: "youtube" },
      });
    });

    it("fails the row when the YouTube connection is gone", async () => {
      useDb({ native: [youtubeRow()] });
      vi.mocked(resolvePlatformAccount).mockResolvedValue(null);

      await expect(syncNativeSchedules()).resolves.toBe(1);
      expect(fetchYouTubeVideoStatus).not.toHaveBeenCalled();
      expect(events()[0]).toMatchObject({
        event: "failed",
        errorMessage: "The YouTube connection is gone. Reconnect YouTube.",
      });
    });

    it("fails rows without a stored video id", async () => {
      useDb({ native: [youtubeRow({ facebook_post_id: null })] });

      await expect(syncNativeSchedules()).resolves.toBe(1);
      expect(resolvePlatformAccount).not.toHaveBeenCalled();
      expect(events()[0]).toMatchObject({
        event: "failed",
        errorMessage: "YouTube did not return an id for this upload.",
      });
    });
  });
});
