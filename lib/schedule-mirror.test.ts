import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/schedule-events", () => ({ recordScheduleEvent: vi.fn() }));

import { sql } from "@/lib/db";
import { recordScheduleEvent } from "@/lib/schedule-events";
import { recordNativeSchedule, type NativePublishResult } from "./schedule-mirror";

const sqlMock = sql as unknown as Mock;
const events = () =>
  vi.mocked(recordScheduleEvent).mock.calls.map((call) => call[0]);

const page = { id: "p1", name: "NeuralVerse" };

const okResult = (id = "fb_1"): NativePublishResult => ({ page, ok: true, id });
const failedResult = (error?: string): NativePublishResult => ({
  page,
  ok: false,
  ...(error ? { error } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockResolvedValue([{ id: 77 }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const insertValues = () => sqlMock.mock.calls[0].slice(1);

describe("recordNativeSchedule", () => {
  it("records a scheduled publish beyond the immediate window", async () => {
    const scheduledFor = new Date(Date.now() + 60 * 60_000);

    await recordNativeSchedule({
      workspaceId: "ws1",
      userId: "u1",
      kind: "reel",
      text: "caption",
      scheduledFor,
      results: [okResult()],
    });

    expect(insertValues()).toEqual([
      "ws1",
      null, // newsItemId
      null, // draftId
      "caption",
      scheduledFor.toISOString(),
      "scheduled",
      "reel",
      "facebook", // source = platform
      "fb_1",
      JSON.stringify([okResult()]),
      "p1",
      null,
      "u1",
    ]);
    expect(events()[0]).toMatchObject({
      scheduledPostId: 77,
      event: "scheduled",
      source: "composer",
      actorUserId: "u1",
      facebookPostId: "fb_1",
      metadata: { kind: "reel", executor: "facebook", pages: 1, published: 1 },
    });
  });

  it("treats publishes inside the 60s window as immediate", async () => {
    await recordNativeSchedule({
      workspaceId: "ws1",
      userId: "u1",
      kind: "post",
      text: "",
      scheduledFor: new Date(Date.now() + 30_000),
      results: [okResult()],
    });

    expect(insertValues()[5]).toBe("published");
    expect(insertValues()[3]).toBe("(no caption)");
    expect(events()[0].event).toBe("published");
  });

  it("records a null schedule time as published now", async () => {
    await recordNativeSchedule({
      workspaceId: "ws1",
      userId: "u1",
      kind: "live",
      text: "going live",
      scheduledFor: null,
      results: [okResult("live_1")],
    });

    expect(insertValues()[5]).toBe("published");
  });

  it("records a failed fan-out with the first error message", async () => {
    await recordNativeSchedule({
      workspaceId: "ws1",
      userId: "u1",
      kind: "photo",
      text: "x",
      scheduledFor: null,
      results: [failedResult("boom on p1"), failedResult("boom on p2")],
    });

    expect(insertValues()[5]).toBe("failed");
    // [8] success id, [10] success page id — both null on failure; [11] error.
    expect(insertValues()[8]).toBeNull();
    expect(insertValues()[10]).toBeNull();
    expect(insertValues()[11]).toBe("boom on p1");
    expect(events()[0]).toMatchObject({ event: "failed", errorMessage: "boom on p1" });
  });

  it("uses a default message when every page failed silently", async () => {
    await recordNativeSchedule({
      workspaceId: "ws1",
      userId: "u1",
      kind: "video",
      text: "x",
      scheduledFor: null,
      results: [failedResult()],
    });

    expect(insertValues()[11]).toBe(
      "Facebook rejected the publish on every selected Page."
    );
  });

  it("mirrors YouTube uploads as source='youtube' rows", async () => {
    const channel = { id: "UC1", name: "Neural-Verse" };

    await recordNativeSchedule({
      workspaceId: "ws1",
      userId: "u1",
      kind: "video",
      text: "Launch video",
      scheduledFor: new Date(Date.now() + 60 * 60_000),
      results: [
        {
          page: channel,
          ok: true,
          id: "yt_video_1",
          permalink: "https://www.youtube.com/watch?v=yt_video_1",
        },
      ],
      platform: "youtube",
    });

    expect(insertValues()[7]).toBe("youtube");
    expect(insertValues()[8]).toBe("yt_video_1");
    expect(insertValues()[10]).toBe("UC1");
    expect(events()[0]).toMatchObject({
      event: "scheduled",
      metadata: { executor: "youtube", kind: "video" },
    });
  });

  it("uses a platform-neutral failure message for YouTube", async () => {
    await recordNativeSchedule({
      workspaceId: "ws1",
      userId: "u1",
      kind: "video",
      text: "x",
      scheduledFor: null,
      results: [failedResult()],
      platform: "youtube",
    });

    expect(insertValues()[11]).toBe(
      "YouTube rejected the publish on every selected target."
    );
  });

  it("never lets a recording failure fail the publish", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sqlMock.mockRejectedValue(new Error("connection refused"));

    await expect(
      recordNativeSchedule({
        workspaceId: "ws1",
        userId: "u1",
        kind: "post",
        text: "x",
        scheduledFor: null,
        results: [okResult()],
      })
    ).resolves.toBeUndefined();

    expect(errorSpy.mock.calls[0][0]).toContain("schedule-mirror");
    expect(recordScheduleEvent).not.toHaveBeenCalled();
  });
});
