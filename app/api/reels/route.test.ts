import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requirePublishingConnection: vi.fn(),
}));
vi.mock("@/lib/blob", () => ({
  stagedFileToBuffer: vi.fn(),
  deleteStagedBlobs: vi.fn(),
}));
vi.mock("@/lib/facebook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/facebook")>();
  return { ...actual, publishPageReel: vi.fn() };
});
vi.mock("@/lib/publishing/connection", () => ({
  requirePublishingConnection: vi.fn(),
}));
vi.mock("@/lib/publishing/crosspost", () => ({
  publishToSelectedPages: vi.fn(),
  crosspostResponse: vi.fn(),
}));
vi.mock("@/lib/schedule-mirror", () => ({ recordNativeSchedule: vi.fn() }));
vi.mock("@/lib/reel-meta", () => ({ readMp4DurationSeconds: vi.fn() }));

import { deleteStagedBlobs, stagedFileToBuffer } from "@/lib/blob";
import { publishPageReel } from "@/lib/facebook";
import { crosspostResponse, publishToSelectedPages } from "@/lib/publishing/crosspost";
import { requirePublishingConnection } from "@/lib/publishing/connection";
import { readMp4DurationSeconds } from "@/lib/reel-meta";
import { POST } from "./route";

const requireMock = requirePublishingConnection as unknown as Mock;
const stageMock = stagedFileToBuffer as unknown as Mock;
const delMock = deleteStagedBlobs as unknown as Mock;
const publishMock = publishToSelectedPages as unknown as Mock;
const responseMock = crosspostResponse as unknown as Mock;
const reelMock = publishPageReel as unknown as Mock;
const durationMock = readMp4DurationSeconds as unknown as Mock;

const access = {
  user: { id: "u1" },
  workspace: { id: "ws_1", role: "owner" },
};

/** A minimal valid MP4 (ftyp + mdat) is not needed — reel-meta reads the
 * buffer, so the fixture is shaped for the mocked duration parser below. */
function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/reels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireMock.mockResolvedValue({ response: null, context: { access } });
  stageMock.mockResolvedValue(Buffer.alloc(64 * 1024 * 1024)); // 64 MB
  delMock.mockResolvedValue(undefined);
  publishMock.mockImplementation(async ({ publish }) => {
    const result = await publish({ id: "p1", accessToken: "token", name: "NeuralVerse" });
    return { results: [{ page: { id: "p1", name: "NeuralVerse" }, ok: true, ...result }] };
  });
  reelMock.mockResolvedValue({ id: "fb_1", permalink: null });
  durationMock.mockReturnValue(30); // a plausible 30-second reel
  responseMock.mockReturnValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
});

describe("POST /api/reels (Blob-staged)", () => {
  it("rejects requests without a staged video url", async () => {
    const res = await POST(post({ caption: "no video" }));
    expect(res.status).toBe(400);
    expect(stageMock).not.toHaveBeenCalled();
  });

  it("rejects a blob that fails store authentication", async () => {
    stageMock.mockRejectedValueOnce(new Error("Blob not found"));

    const res = await POST(post({
      videoUrl: "https://evil.example/fake.mp4",
      pageIds: ["p1"],
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Blob not found");
    expect(publishMock).not.toHaveBeenCalled();
    expect(delMock).not.toHaveBeenCalled();
  });

  it("stages, publishes, and deletes the staging copy in the same order", async () => {
    const res = await POST(post({
      videoUrl: "https://store.public.blob.vercel-storage.com/reels/a.mp4",
      filename: "clip.mp4",
      videoType: "video/mp4",
      caption: "My reel",
      pageIds: ["p1"],
    }));

    expect(res.status).toBe(201);
    expect(stageMock).toHaveBeenCalledWith(
      "https://store.public.blob.vercel-storage.com/reels/a.mp4"
    );
    const page = publishMock.mock.calls[0][0];
    await page.publish({ id: "p1", accessToken: "token", name: "NeuralVerse" });
    expect(reelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        video: {
          bytes: expect.any(Buffer),
          type: "video/mp4",
          filename: "clip.mp4",
        },
        caption: "My reel",
        scheduledPublishTime: null,
      })
    );
    expect(delMock).toHaveBeenCalledWith([
      "https://store.public.blob.vercel-storage.com/reels/a.mp4",
    ]);
  });

  it("deletes the staging copy even when the publish fails", async () => {
    publishMock.mockRejectedValueOnce(new Error("Facebook rejected the reel"));

    const res = await POST(post({
      videoUrl: "https://store.public.blob.vercel-storage.com/reels/b.mp4",
      pageIds: ["p1"],
    }));

    expect(res.status).toBe(500); // non-Facebook error → generic 500 branch
    expect(delMock).toHaveBeenCalledWith([
      "https://store.public.blob.vercel-storage.com/reels/b.mp4",
    ]);
  });

  it("rejects unreadable video lengths", async () => {
    durationMock.mockReturnValueOnce(null);

    const res = await POST(post({
      videoUrl: "https://store.public.blob.vercel-storage.com/reels/c.mp4",
      pageIds: ["p1"],
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Could not read the video length/i);
    expect(publishMock).not.toHaveBeenCalled();
    expect(delMock).not.toHaveBeenCalled();
  });

  it("rejects reels outside the 3–90 second range", async () => {
    durationMock.mockReturnValueOnce(120);

    const res = await POST(post({
      videoUrl: "https://store.public.blob.vercel-storage.com/reels/c.mp4",
      pageIds: ["p1"],
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Reels must be 3 to 90 seconds. This clip is 120 seconds."
    );
    expect(publishMock).not.toHaveBeenCalled();
    expect(delMock).not.toHaveBeenCalled();
  });

  it("keeps the notification context on the shared response builder", async () => {
    await POST(post({
      videoUrl: "https://store.public.blob.vercel-storage.com/reels/a.mp4",
      pageIds: ["p1"],
    }));

    expect(responseMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scheduledFor: null }),
      expect.objectContaining({ workspaceId: "ws_1", actorUserId: "u1", kind: "reel" })
    );
  });
});
