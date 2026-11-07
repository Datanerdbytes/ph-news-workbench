import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import { recordScheduleEvent } from "./schedule-events";

const sqlMock = sql as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordScheduleEvent", () => {
  it("inserts the event with optional fields nulled out", async () => {
    await recordScheduleEvent({
      workspaceId: "ws1",
      scheduledPostId: 21,
      event: "published",
      source: "composer",
    });

    const [strings, ...values] = sqlMock.mock.calls[0];
    expect(strings.join(" ")).toContain("INSERT INTO scheduled_post_events");
    expect(values).toEqual([
      "ws1",
      21,
      null, // newsItemId
      "published",
      "composer",
      null, // actorUserId
      null, // facebookPostId
      null, // errorMessage
      null, // metadata
    ]);
  });

  it("stringifies metadata as jsonb", async () => {
    await recordScheduleEvent({
      workspaceId: "ws1",
      scheduledPostId: 21,
      newsItemId: 5,
      event: "retrying",
      source: "scheduler",
      actorUserId: "u1",
      facebookPostId: "fb_1",
      errorMessage: "boom",
      metadata: { attempt: 2 },
    });

    const values = sqlMock.mock.calls[0].slice(1);
    expect(values[2]).toBe(5);
    expect(values[5]).toBe("u1");
    expect(values[6]).toBe("fb_1");
    expect(values[7]).toBe("boom");
    expect(values[8]).toBe(JSON.stringify({ attempt: 2 }));
  });

  it("swallows insert failures so publishing never breaks on logging", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sqlMock.mockRejectedValue(new Error("connection refused"));

    await expect(
      recordScheduleEvent({
        workspaceId: "ws1",
        scheduledPostId: 21,
        event: "claimed",
        source: "scheduler",
      })
    ).resolves.toBeUndefined();

    expect(errorSpy.mock.calls[0][0]).toContain("schedule-events");
  });
});
