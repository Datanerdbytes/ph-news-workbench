import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import {
  buildGoogleAuthorizationUrl,
  createYouTubeUploadSession,
  ensureFreshYouTubeToken,
  exchangeGoogleCode,
  fetchYouTubeChannel,
  uploadYouTubeBytes,
  YouTubeAuthError,
} from "./youtube";

const sqlMock = sql as unknown as Mock;
const fetchMock = vi.spyOn(globalThis, "fetch");

function respond(
  body: unknown,
  options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}
) {
  fetchMock.mockResolvedValueOnce({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: new Headers(options.headers ?? {}),
    json: async () => body,
  } as unknown as Response);
}

beforeEach(() => {
  sqlMock.mockReset();
  fetchMock.mockReset();
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  process.env.BETTER_AUTH_SECRET = "test-secret-for-youtube-tokens";
});

describe("buildGoogleAuthorizationUrl", () => {
  it("forces offline access with consent so a refresh token is issued", () => {
    const url = new URL(buildGoogleAuthorizationUrl("st-1"));
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.upload"
    );
    expect(url.searchParams.get("state")).toBe("st-1");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/youtube/callback"
    );
  });
});

describe("exchangeGoogleCode", () => {
  it("projects the token response with an absolute expiry", async () => {
    respond({
      access_token: "g-access",
      refresh_token: "g-refresh",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      expires_in: 3600,
    });
    const token = await exchangeGoogleCode("code-1");
    expect(token).toMatchObject({
      accessToken: "g-access",
      refreshToken: "g-refresh",
    });
    expect(token.scope).toEqual([
      "https://www.googleapis.com/auth/youtube.upload",
    ]);
    expect(Date.parse(token.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("surfaces Google's error description", async () => {
    respond({ error: "invalid_grant", error_description: "Code already used." }, { ok: false, status: 400 });
    await expect(exchangeGoogleCode("code-1")).rejects.toThrow(
      "Code already used."
    );
  });
});

describe("ensureFreshYouTubeToken", () => {
  const base = {
    platform: "youtube" as const,
    platformUserId: "UC1",
    username: "NeuralVerse",
    scopes: ["https://www.googleapis.com/auth/youtube.upload"],
    expiresAt: null,
  };

  it("passes the access token straight through while it is fresh", async () => {
    const token = await ensureFreshYouTubeToken(
      { ...base, accessToken: "live-token", expiresAt: new Date(Date.now() + 900_000).toISOString() },
      "ws1"
    );
    expect(token).toBe("live-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes, stores the rotated pair, and returns the new token", async () => {
    respond({
      access_token: "rotated",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      expires_in: 3500,
    });
    const token = await ensureFreshYouTubeToken(
      {
        ...base,
        accessToken: "stale",
        refreshToken: "refresh-cipher",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      "ws1"
    );
    expect(token).toBe("rotated");
    expect(sqlMock).toHaveBeenCalledTimes(1);
    const query = (sqlMock.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(query).toContain("UPDATE youtube_connections");
    // Last interpolation is the workspace id.
    expect(sqlMock.mock.calls[0]).toContain("ws1");
  });

  it("fails as an auth error without a stored refresh token", async () => {
    await expect(
      ensureFreshYouTubeToken(
        { ...base, accessToken: "stale", expiresAt: new Date(Date.now() - 1000).toISOString() },
        "ws1"
      )
    ).rejects.toThrow(YouTubeAuthError);
  });
});

describe("fetchYouTubeChannel", () => {
  it("maps the first item of the channel list", async () => {
    respond({
      items: [
        {
          id: "UC_channel",
          snippet: {
            title: "NeuralVerse News",
            thumbnails: { high: { url: "https://yt/img.jpg" } },
          },
        },
      ],
    });
    const channel = await fetchYouTubeChannel("token");
    expect(channel).toEqual({
      id: "UC_channel",
      title: "NeuralVerse News",
      thumbnail: "https://yt/img.jpg",
    });
  });

  it("returns null without items and fails on token rejection", async () => {
    respond({ items: [] });
    expect(await fetchYouTubeChannel("token")).toBeNull();
  });
});

describe("createYouTubeUploadSession", () => {
  const metadata = {
    title: "Newsroom cut",
    description: "Day two",
    privacyStatus: "private" as const,
    madeForKids: false,
  };

  it("opens a resumable session advertising the media length", async () => {
    respond({}, { headers: { location: "https://upload.google/session-1" } });
    const location = await createYouTubeUploadSession({
      accessToken: "token",
      sizeBytes: 12_345,
      contentType: "video/mp4",
      metadata,
    });
    expect(location).toBe("https://upload.google/session-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "x-upload-content-length": "12345",
      "x-upload-content-type": "video/mp4",
    });
    expect((init.headers as Record<string, string>)["x-upload-content-length"]).toBe(
      "12345"
    );
  });

  it("fails clearly when the session is refused", async () => {
    respond({ error: { message: "Upload quota exceeded." } }, { ok: false, status: 403 });
    await expect(
      createYouTubeUploadSession({
        accessToken: "token",
        sizeBytes: 10,
        contentType: "video/mp4",
        metadata,
      })
    ).rejects.toThrow(/quota/);
  });
});

describe("uploadYouTubeBytes", () => {
  it("resolves the video id from the completed session response", async () => {
    respond({ id: "video-9" });
    const id = await uploadYouTubeBytes(
      "https://upload.google/session-1",
      Buffer.from("video-bytes"),
      "video/mp4"
    );
    expect(id).toBe("video-9");
  });

  it("maps quotaExceeded to a human explanation", async () => {
    await expect(
      (async () => {
        respond(
          {
            error: {
              message: "The request failed.",
              errors: [{ reason: "quotaExceeded" }],
            },
          },
          { ok: false, status: 403 }
        );
        return uploadYouTubeBytes(
          "https://upload.google/session-1",
          Buffer.from("bytes"),
          "video/mp4"
        );
      })()
    ).rejects.toThrow(/quota for today is exhausted/);
  });
});
