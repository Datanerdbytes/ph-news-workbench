import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/blob", () => ({ assertStagedBlob: vi.fn() }));
vi.mock("@/lib/publishing/connection", () => ({
  requirePlatformConnection: vi.fn(),
}));
vi.mock("@/lib/youtube", () => ({
  ensureFreshYouTubeToken: vi.fn(),
  // Route checks `error instanceof YouTubeAuthError`, so the mock needs a
  // real class shape.
  YouTubeAuthError: class YouTubeAuthError extends Error {},
}));
vi.mock("@/lib/publishing/youtube", () => ({
  publishYouTubeVideo: vi.fn(),
}));
vi.mock("@/lib/schedule-mirror", () => ({ recordNativeSchedule: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  notifyPublishAttemptFailure: vi.fn(),
}));

import { ensureFreshYouTubeToken } from "@/lib/youtube";
import { recordNativeSchedule } from "@/lib/schedule-mirror";
import { publishYouTubeVideo } from "@/lib/publishing/youtube";
import { requirePlatformConnection } from "@/lib/publishing/connection";
import { POST } from "./route";

const requireMock = requirePlatformConnection as unknown as Mock;
const tokenMock = ensureFreshYouTubeToken as unknown as Mock;
const publishMock = publishYouTubeVideo as unknown as Mock;
const mirrorMock = recordNativeSchedule as unknown as Mock;

const access = {
  user: { id: "u1" },
  workspace: { id: "ws_1", role: "owner" },
};
const connection = {
  platform: "youtube" as const,
  platformUserId: "UC1",
  username: "Neural-Verse",
  accessToken: "cipher-token",
  scopes: ["https://www.googleapis.com/auth/youtube.upload"],
  expiresAt: null,
};

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/youtube/videos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const stagedBody = {
  title: "Newsroom cut",
  description: "Day two",
  privacyStatus: "public",
  madeForKids: false,
  videoUrl: "https://bucket.public.blob.vercel-storage.com/youtube/v.mp4",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireMock.mockResolvedValue({
    context: { access, connection },
  });
  tokenMock.mockResolvedValue("fresh-token");
  publishMock.mockResolvedValue({
    id: "vid_1",
    permalink: "https://www.youtube.com/watch?v=vid_1",
  });
  mirrorMock.mockResolvedValue(undefined);
});

describe("POST /api/youtube/videos", () => {
  it("uploads immediately and mirrors a published row", async () => {
    const response = await POST(post(stagedBody));

    expect(response.status).toBe(201);
    expect(publishMock).toHaveBeenCalledWith({
      accessToken: "fresh-token",
      metadata: {
        title: "Newsroom cut",
        description: "Day two",
        privacyStatus: "public",
        madeForKids: false,
      },
      videoUrl: stagedBody.videoUrl,
    });
    expect(mirrorMock).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      userId: "u1",
      kind: "video",
      text: "Newsroom cut",
      scheduledFor: null,
      results: [
        {
          page: { id: "UC1", name: "Neural-Verse" },
          ok: true,
          id: "vid_1",
          permalink: "https://www.youtube.com/watch?v=vid_1",
        },
      ],
      platform: "youtube",
    });
    const data = (await response.json()) as { scheduledFor: string | null };
    expect(data.scheduledFor).toBeNull();
  });

  it("schedules via publishAt, forcing the video private", async () => {
    // Zero the milliseconds — the route stores whole unix seconds, so the
    // ISO string must survive the round-trip byte for byte.
    const slot = new Date(Date.now() + 60 * 60_000);
    slot.setMilliseconds(0);
    const scheduledFor = slot.toISOString();

    const response = await POST(post({ ...stagedBody, scheduledFor }));

    expect(response.status).toBe(201);
    expect(publishMock).toHaveBeenCalledTimes(1);
    const call = publishMock.mock.calls[0][0] as {
      metadata: { privacyStatus: string; publishAt?: string };
    };
    expect(call.metadata.privacyStatus).toBe("private");
    expect(call.metadata.publishAt).toBe(scheduledFor);
    expect(mirrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        kind: "video",
        platform: "youtube",
        scheduledFor: slot,
      })
    );
    const data = (await response.json()) as { scheduledFor: string | null };
    expect(data.scheduledFor).toBe(scheduledFor);
  });

  it("rejects schedule times inside the 10-minute floor", async () => {
    const scheduledFor = new Date(Date.now() + 5 * 60_000).toISOString();

    const response = await POST(post({ ...stagedBody, scheduledFor }));

    expect(response.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
    expect(mirrorMock).not.toHaveBeenCalled();
  });

  it("rejects schedule times beyond the 75-day window", async () => {
    const scheduledFor = new Date(
      Date.now() + 80 * 24 * 60 * 60_000
    ).toISOString();

    const response = await POST(post({ ...stagedBody, scheduledFor }));

    expect(response.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });
});
