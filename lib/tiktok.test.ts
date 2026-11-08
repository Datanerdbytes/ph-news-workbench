import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import {
  buildTikTokAuthorizationUrl,
  createPkcePair,
  exchangeTikTokCode,
  fetchTikTokPublishStatus,
  fetchTikTokUser,
  initTikTokVideoPost,
  tiktokPublicPostingApproved,
  TikTokAuthError,
} from "./tiktok";

const sqlMock = sql as unknown as Mock;
const fetchMock = vi.spyOn(globalThis, "fetch");

function respond(
  body: unknown,
  options: { ok?: boolean; status?: number } = {}
) {
  fetchMock.mockResolvedValueOnce({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response);
}

beforeEach(() => {
  sqlMock.mockReset();
  fetchMock.mockReset();
  process.env.TIKTOK_CLIENT_KEY = "tiktok-key";
  process.env.TIKTOK_CLIENT_SECRET = "tiktok-secret";
  process.env.BETTER_AUTH_URL = "http://localhost:3006";
  delete process.env.TIKTOK_REDIRECT_URI;
});

describe("createPkcePair", () => {
  it("pairs a url-safe verifier with its S256 challenge", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });
});

describe("buildTikTokAuthorizationUrl", () => {
  it("forces S256 PKCE against the workbench redirect", () => {
    const url = new URL(
      buildTikTokAuthorizationUrl({ state: "st-1", codeChallenge: "chal-1" })
    );
    expect(url.pathname).toBe("/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("tiktok-key");
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.publish");
    expect(url.searchParams.get("code_challenge")).toBe("chal-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3006/api/tiktok/callback"
    );
    expect(url.searchParams.get("state")).toBe("st-1");
  });
});

describe("tiktokPublicPostingApproved", () => {
  it("is off unless explicitly approved", () => {
    delete process.env.TIKTOK_PUBLIC_POSTING;
    expect(tiktokPublicPostingApproved()).toBe(false);
    process.env.TIKTOK_PUBLIC_POSTING = "false";
    expect(tiktokPublicPostingApproved()).toBe(false);
    process.env.TIKTOK_PUBLIC_POSTING = "true";
    expect(tiktokPublicPostingApproved()).toBe(true);
    delete process.env.TIKTOK_PUBLIC_POSTING;
  });
});

describe("exchangeTikTokCode", () => {
  it("sends the PKCE verifier and projects an absolute expiry", async () => {
    respond({
      access_token: "tt-access",
      refresh_token: "tt-refresh",
      scope: "user.info.basic,video.publish",
      open_id: "open-1",
      expires_in: 86400,
    });
    const token = await exchangeTikTokCode("code-1", "verifier-1");
    expect(token).toMatchObject({
      accessToken: "tt-access",
      refreshToken: "tt-refresh",
      openId: "open-1",
    });
    expect(Date.parse(token.expiresAt)).toBeGreaterThan(Date.now());
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("code_verifier=verifier-1");
    expect(body).toContain("grant_type=authorization_code");
  });

  it("surfaces TikTok's error description", async () => {
    respond(
      { error: "invalid_code", error_description: "Code already used." },
      { ok: false, status: 400 }
    );
    await expect(exchangeTikTokCode("code-1", "verifier-1")).rejects.toThrow(
      "Code already used."
    );
  });
});

describe("ensureFreshTikTokToken", () => {
  const base = {
    platform: "tiktok" as const,
    platformUserId: "open-1",
    username: "NeuralVerse",
    scopes: ["user.info.basic", "video.publish"],
    expiresAt: null,
  };

  const importSubject = async () => (await import("./tiktok")).ensureFreshTikTokToken;

  it("passes the access token through while it is fresh", async () => {
    const ensureFreshTikTokToken = await importSubject();
    const token = await ensureFreshTikTokToken(
      {
        ...base,
        accessToken: "live-token",
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      },
      "ws1"
    );
    expect(token).toBe("live-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes, stores the rotated pair, and returns the new token", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-tiktok-tokens";
    const ensureFreshTikTokToken = await importSubject();
    respond({
      access_token: "rotated-tt",
      scope: "user.info.basic,video.publish",
      expires_in: 86000,
    });
    const token = await ensureFreshTikTokToken(
      {
        ...base,
        accessToken: "stale",
        refreshToken: "refresh-cipher",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      "ws1"
    );
    expect(token).toBe("rotated-tt");
    expect(sqlMock).toHaveBeenCalledTimes(1);
    const query = (sqlMock.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(query).toContain("UPDATE tiktok_connections");
    expect(sqlMock.mock.calls[0]).toContain("ws1");
  });

  it("fails as an auth error without a stored refresh token", async () => {
    const ensureFreshTikTokToken = await importSubject();
    await expect(
      ensureFreshTikTokToken(
        { ...base, accessToken: "stale", expiresAt: new Date(Date.now() - 1000).toISOString() },
        "ws1"
      )
    ).rejects.toThrow(TikTokAuthError);
  });
});

describe("fetchTikTokUser", () => {
  it("maps the profile payload", async () => {
    respond({
      data: {
        user: {
          open_id: "open-9",
          display_name: "NeuralVerse",
          avatar_url: "https://tiktok/avatar.jpg",
        },
      },
    });
    const user = await fetchTikTokUser("token");
    expect(user).toEqual({
      id: "open-9",
      name: "NeuralVerse",
      thumbnail: "https://tiktok/avatar.jpg",
    });
  });

  it("returns null without a resolved user", async () => {
    respond({ data: { user: {} } });
    expect(await fetchTikTokUser("token")).toBeNull();
  });

  it("throws when the token is rejected", async () => {
    respond({}, { ok: false, status: 401 });
    await expect(fetchTikTokUser("token")).rejects.toThrow(
      "The TikTok access token was rejected."
    );
  });
});

describe("initTikTokVideoPost", () => {
  const metadata = { title: "The hook", privacyStatus: "SELF_ONLY" as const };

  it("opens a PULL_FROM_URL direct post and returns its id", async () => {
    respond({ data: { publish_id: "pub-1" } });
    const result = await initTikTokVideoPost({
      accessToken: "token",
      metadata,
      videoUrl: "https://blob/staged.mp4",
    });
    expect(result).toEqual({ publishId: "pub-1" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.source_info).toEqual({
      source: "PULL_FROM_URL",
      video_url: "https://blob/staged.mp4",
    });
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
  });

  it("forwards TikTok's rejection message", async () => {
    respond(
      {
        error: { code: "profile_permission_denied", message: "No publish scope." },
      },
      { ok: false, status: 403 }
    );
    await expect(
      initTikTokVideoPost({
        accessToken: "token",
        metadata,
        videoUrl: "https://blob/staged.mp4",
      })
    ).rejects.toThrow(/No publish scope/);
  });
});

describe("fetchTikTokPublishStatus", () => {
  it("reports processing status and api errors", async () => {
    respond({
      data: {
        status: "PROCESSING",
        errors: [{ message: "Transcoding still running." }],
      },
    });
    const state = await fetchTikTokPublishStatus("pub-1", "token");
    expect(state).toEqual({
      status: "PROCESSING",
      errors: ["Transcoding still running."],
    });
  });

  it("degrades to unknown state on any failure", async () => {
    respond({}, { ok: false, status: 500 });
    expect(await fetchTikTokPublishStatus("pub-1", "token")).toEqual({
      status: null,
      errors: [],
    });
  });
});
