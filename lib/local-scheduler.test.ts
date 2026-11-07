import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/schedule-worker", () => ({ publishDuePosts: vi.fn() }));

import { publishDuePosts } from "@/lib/schedule-worker";
import { startLocalScheduler } from "./local-scheduler";

const publishMock = publishDuePosts as unknown as Mock;
const holder = globalThis as typeof globalThis & {
  __phScheduleTimer?: ReturnType<typeof setInterval>;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  publishMock.mockResolvedValue({ due: 0, published: 0, failed: 0, synced: 0 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  if (holder.__phScheduleTimer) clearInterval(holder.__phScheduleTimer);
  delete holder.__phScheduleTimer;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("startLocalScheduler", () => {
  it("starts once and publishes due posts every minute", async () => {
    startLocalScheduler();
    startLocalScheduler(); // second call is a no-op

    await vi.advanceTimersByTimeAsync(0);
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith({ source: "scheduler" });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(publishMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(publishMock).toHaveBeenCalledTimes(3);
  });

  it("logs the run when posts were due", async () => {
    publishMock.mockResolvedValue({ due: 2, published: 1, failed: 0, synced: 1 });

    startLocalScheduler();
    await vi.advanceTimersByTimeAsync(0);

    const started = vi.mocked(console.log).mock.calls.find((call) =>
      String(call[0]).includes('"started"')
    );
    const ran = vi.mocked(console.log).mock.calls.find((call) =>
      String(call[0]).includes('"ran"')
    );
    expect(started).toBeDefined();
    expect(String(ran![0])).toContain('"due":2');
  });

  it("keeps running when a tick fails", async () => {
    publishMock.mockRejectedValue(new Error("database unreachable"));

    startLocalScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain("scheduler");

    publishMock.mockResolvedValue({ due: 0, published: 0, failed: 0, synced: 0 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(publishMock).toHaveBeenCalledTimes(2);
  });

  it("warns in production when CRON_SECRET is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");

    startLocalScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(
      vi.mocked(console.warn).mock.calls.some((call) =>
        String(call[0]).includes("cron_secret_missing")
      )
    ).toBe(true);
  });

  it("does not warn in production when CRON_SECRET is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "s3cret");

    startLocalScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.mocked(console.warn).mock.calls).toHaveLength(0);
  });
});
