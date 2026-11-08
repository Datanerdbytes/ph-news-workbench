import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const { ACCESS } = vi.hoisted(() => ({
  ACCESS: { user: { id: "u1" }, workspace: { id: "ws1" } },
}));

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/session", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireWorkspace: vi.fn(async () => ACCESS),
    unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    requireOwner: vi.fn(async () => null),
    requireUser: vi.fn(async () => null),
  };
});

import { sql } from "@/lib/db";
import { encryptTikTokSecret, encryptYouTubeSecret } from "@/lib/facebook-token";
import { requirePlatformConnection, resolvePlatformAccount } from "./connection";

const sqlMock = sql as unknown as Mock;

process.env.BETTER_AUTH_SECRET = "test-secret-for-platform-connections";

function youtubeRow(overrides: Record<string, unknown> = {}) {
  return {
    platform_user_id: "UC123",
    username: "NeuralVerse",
    access_token: encryptYouTubeSecret("ya29.access-token"),
    refresh_token: encryptYouTubeSecret("ya29.refresh-token"),
    scopes: "https://www.googleapis.com/auth/youtube.upload",
    expires_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  sqlMock.mockReset();
});

describe("requirePlatformConnection", () => {
  it("loads, decrypts, and projects the YouTube row", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM youtube_connections")) return [youtubeRow()];
      return [];
    });

    const result = await requirePlatformConnection(
      new Request("https://app.test/api/youtube/publish", { method: "POST" }),
      "youtube",
      "publish a video"
    );
    expect(result.context?.connection).toEqual({
      platform: "youtube",
      platformUserId: "UC123",
      username: "NeuralVerse",
      accessToken: "ya29.access-token",
      refreshToken: "ya29.refresh-token",
      scopes: ["https://www.googleapis.com/auth/youtube.upload"],
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("responds 409 not_connected when the workspace has no row", async () => {
    sqlMock.mockResolvedValue([]);
    const result = await requirePlatformConnection(
      new Request("https://app.test/api/youtube/publish", { method: "POST" }),
      "youtube",
      "publish a video"
    );
    const body = await result.response?.json();
    expect(result.response?.status).toBe(409);
    expect(body).toMatchObject({
      code: "not_connected",
      error: "Connect your YouTube account before publish a video.",
    });
  });

  it("responds 403 when the stored grant lacks the upload scope", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join(" ").includes("FROM youtube_connections")
        ? [youtubeRow({ scopes: "youtube.readonly" })]
        : []
    );
    const result = await requirePlatformConnection(
      new Request("https://app.test/api/youtube/publish", { method: "POST" }),
      "youtube",
      "publish a video"
    );
    const body = await result.response?.json();
    expect(result.response?.status).toBe(403);
    expect(body).toMatchObject({ code: "scope_missing" });
    expect(body.error).toContain("youtube.upload");
  });

  it("responds 409 when the stored token cannot be decrypted", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join(" ").includes("FROM youtube_connections")
        ? [youtubeRow({ access_token: "not-a-valid-payload" })]
        : []
    );
    const result = await requirePlatformConnection(
      new Request("https://app.test/api/youtube/publish", { method: "POST" }),
      "youtube",
      "publish a video"
    );
    const body = await result.response?.json();
    expect(result.response?.status).toBe(409);
    expect(body).toMatchObject({ code: "not_connected" });
  });

  it("resolves TikTok rows through the same gate", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM tiktok_connections")) {
        return [
          {
            platform_user_id: "tt-user-1",
            username: "NeuralVerse",
            access_token: encryptTikTokSecret("tiktok-at"),
            refresh_token: null,
            scopes: null,
            expires_at: null,
          },
        ];
      }
      return [];
    });

    const result = await requirePlatformConnection(
      new Request("https://app.test/api/tiktok/publish", { method: "POST" }),
      "tiktok",
      "post a video"
    );
    expect(result.context?.connection).toMatchObject({
      platform: "tiktok",
      platformUserId: "tt-user-1",
      accessToken: "tiktok-at",
      refreshToken: undefined,
      scopes: [],
      expiresAt: null,
    });
  });
});

describe("resolvePlatformAccount", () => {
  it("returns null when the workspace is not connected", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await resolvePlatformAccount("ws1", "youtube")).toBeNull();
  });

  it("decrypts the row for the executor path", async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join(" ").includes("FROM youtube_connections")
        ? [youtubeRow()]
        : []
    );
    const account = await resolvePlatformAccount("ws1", "youtube");
    expect(account).toMatchObject({
      platform: "youtube",
      platformUserId: "UC123",
      accessToken: "ya29.access-token",
    });
  });
});
