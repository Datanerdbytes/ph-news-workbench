import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/blob", () => ({
  assertStagedBlob: vi.fn(async () => undefined),
  stagedFileToBuffer: vi.fn(async () => Buffer.from("video-bytes")),
  deleteStagedBlobs: vi.fn(async () => undefined),
}));

vi.mock("@/lib/youtube", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/youtube")>();
  return {
    ...actual,
    createYouTubeUploadSession: vi.fn(
      async () => "https://upload.google/session-1"
    ),
    uploadYouTubeBytes: vi.fn(async () => "video-1"),
  };
});

import {
  createYouTubeUploadSession,
  uploadYouTubeBytes,
} from "@/lib/youtube";
import { publishYouTubeVideo } from "./youtube";

const sessionMock = vi.mocked(createYouTubeUploadSession) as unknown as ReturnType<typeof vi.fn>;
const bytesMock = uploadYouTubeBytes as unknown as ReturnType<typeof vi.fn>;
const blobModule = await import("@/lib/blob");
const toBufferMock = (blobModule as unknown as {
  stagedFileToBuffer: ReturnType<typeof vi.fn>;
}).stagedFileToBuffer;
const assertMock = (blobModule as unknown as {
  assertStagedBlob: ReturnType<typeof vi.fn>;
}).assertStagedBlob;

beforeEach(() => {
  sessionMock.mockClear();
  bytesMock.mockClear();
  toBufferMock.mockClear();
  assertMock.mockClear();
});

const metadata = {
  title: "Newsroom cut",
  description: "",
  privacyStatus: "unlisted" as const,
  madeForKids: false,
};

describe("publishYouTubeVideo", () => {
  it("asserts staging, opens the session with the blob's size, and returns the watch link", async () => {
    toBufferMock.mockResolvedValue(Buffer.from("a".repeat(1024)));
    const result = await publishYouTubeVideo({
      accessToken: "token",
      metadata,
      videoUrl: "https://x.public.blob.vercel-storage.com/youtube/a.mp4",
    });
    expect(assertMock).toHaveBeenCalledTimes(1);
    const sessionArgs = sessionMock.mock.calls[0][0];
    expect(sessionArgs.sizeBytes).toBe(1024);
    expect(sessionArgs.contentType).toBe("video/mp4");
    expect(sessionArgs.metadata).toEqual(metadata);
    expect(bytesMock).toHaveBeenCalledWith(
      "https://upload.google/session-1",
      expect.anything(),
      "video/mp4"
    );
    expect(result).toEqual({
      id: "video-1",
      permalink: "https://www.youtube.com/watch?v=video-1",
    });
  });

  it("treats .mov staging as quicktime", async () => {
    toBufferMock.mockResolvedValue(Buffer.from("bytes"));
    await publishYouTubeVideo({
      accessToken: "token",
      metadata,
      videoUrl: "https://x.public.blob.vercel-storage.com/youtube/b.mov",
    });
    expect(sessionMock.mock.calls[0][0].contentType).toBe("video/quicktime");
  });

  it("rejects empty staged files", async () => {
    toBufferMock.mockResolvedValue(Buffer.alloc(0));
    await expect(
      publishYouTubeVideo({ accessToken: "t", metadata, videoUrl: "https://x.public.blob.vercel-storage.com/youtube/c.mp4" })
    ).rejects.toThrow(/empty/);
  });

  it("enforces the 1 GB staging cap", async () => {
    toBufferMock.mockResolvedValue(Buffer.alloc(1024 * 1024 * 1024 + 1));
    await expect(
      publishYouTubeVideo({ accessToken: "t", metadata, videoUrl: "https://x.public.blob.vercel-storage.com/youtube/d.mp4" })
    ).rejects.toThrow(/1 GB staging cap/);
  });
});
