import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseScheduledPublishTime, scheduledFields } from "./schedule";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseScheduledPublishTime", () => {
  it("treats missing input as publish-immediately", () => {
    expect(parseScheduledPublishTime(undefined)).toEqual({ unix: null });
    expect(parseScheduledPublishTime(null)).toEqual({ unix: null });
    expect(parseScheduledPublishTime("")).toEqual({ unix: null });
  });

  it("rejects unparseable dates", () => {
    expect(parseScheduledPublishTime("next tuesdayish")).toEqual({
      unix: null,
      error: "Pick a valid date and time to schedule.",
    });
  });

  it("enforces Meta's 10-minute minimum", () => {
    const soon = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(parseScheduledPublishTime(soon)).toEqual({
      unix: null,
      error: "Scheduled time must be at least 10 minutes from now.",
    });
  });

  it("accepts exactly 10 minutes out", () => {
    const edge = new Date(Date.now() + 10 * 60_000);
    expect(parseScheduledPublishTime(edge.toISOString()).error).toBeUndefined();
  });

  it("enforces Meta's 75-day maximum", () => {
    const far = new Date(Date.now() + 76 * 24 * 60 * 60_000).toISOString();
    expect(parseScheduledPublishTime(far)).toEqual({
      unix: null,
      error: "Scheduling supports at most 75 days ahead.",
    });
  });

  it("returns a unix timestamp for valid windows", () => {
    const target = new Date(Date.now() + 10 * 24 * 60 * 60_000);
    expect(parseScheduledPublishTime(target.toISOString())).toEqual({
      unix: Math.floor(target.getTime() / 1000),
    });
  });
});

describe("scheduledFields", () => {
  it("omits scheduling fields for immediate publishes", () => {
    expect(scheduledFields(null)).toEqual({});
  });

  it("marks the post unpublished with the requested time", () => {
    expect(scheduledFields(1_800_000_000)).toEqual({
      published: "false",
      scheduled_publish_time: "1800000000",
    });
  });
});
