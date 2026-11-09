import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/blob", () => ({
  assertStagedBlob: vi.fn(async () => undefined),
  stagedFileToBuffer: vi.fn(async () => Buffer.alloc(0)),
  deleteStagedBlobs: vi.fn(async () => undefined),
}));

vi.mock("@/lib/tiktok", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tiktok")>();
  return {
    ...actual,
    initTikTokVideoPost: vi.fn(async () => ({ publishId: "pub-pull-1" })),
  };
});

import { initTikTokVideoPost } from "@/lib/tiktok";
import { publishTikTokVideo } from "./tiktok";

const initMock = initTikTokVideoPost as unknown as ReturnType<typeof vi.fn>;
const blobModule = await import("@/lib/blob");
const assertMock = (blobModule as unknown as {
  assertStagedBlob: ReturnType<typeof vi.fn>;
}).assertStagedBlob;

const fetchMock = vi.spyOn(globalThis, "fetch");

function headResponse(contentLength: string | null, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: new Headers(
      contentLength === null ? {} : { "content-length": contentLength }
    ),
  } as unknown as Response;
}

beforeEach(() => {
  initMock.mockClear();
  assertMock.mockClear();
  fetchMock.mockReset();
});

const metadata = { title: "The hook", privacyStatus: "SELF_ONLY" as const };

describe("publishTikTokVideo", () => {
  it("asserts staging, HEADs the size, and opens the pull", async () => {
    fetchMock.mockResolvedValueOnce(headResponse("2048"));
    const result = await publishTikTokVideo({
      accessToken: "token",
      metadata,
      videoUrl: "https://x.public.blob.vercel-storage.com/tiktok/a.mp4",
    });
    expect(assertMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0][0]).toEqual({
      accessToken: "token",
      metadata,
      videoUrl: "https://x.public.blob.vercel-storage.com/tiktok/a.mp4",
    });
    // TikTok pulls the bytes itself — no server-side buffer relay.
    expect(result).toEqual({ id: "pub-pull-1", permalink: null });
  });

  it("rejects an unreadable staging URL", async () => {
    fetchMock.mockResolvedValueOnce(headResponse(null, false));
    await expect(
      publishTikTokVideo({
        accessToken: "t",
        metadata,
        videoUrl: "https://x.public.blob.vercel-storage.com/tiktok/b.mp4",
      })
    ).rejects.toThrow(/could not be read/);
  });

  it("rejects empty staged files", async () => {
    fetchMock.mockResolvedValueOnce(headResponse("0"));
    await expect(
      publishTikTokVideo({
        accessToken: "t",
        metadata,
        videoUrl: "https://x.public.blob.vercel-storage.com/tiktok/c.mp4",
      })
    ).rejects.toThrow(/empty/);
  });

  it("enforces the 1 GB staging cap", async () => {
    fetchMock.mockResolvedValueOnce(headResponse(String(1024 * 1024 * 1024 + 1)));
    await expect(
      publishTikTokVideo({
        accessToken: "t",
        metadata,
        videoUrl: "https://x.public.blob.vercel-storage.com/tiktok/d.mp4",
      })
    ).rejects.toThrow(/1 GB staging cap/);
  });
});
