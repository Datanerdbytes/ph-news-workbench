import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/workspaces", () => ({ getWorkspaceForUser: vi.fn() }));
vi.mock("@/lib/youtube", () => ({
  exchangeGoogleCode: vi.fn(),
  fetchYouTubeChannel: vi.fn(),
  googleConfigured: vi.fn(),
}));
vi.mock("@/lib/facebook-token", () => ({
  encryptYouTubeSecret: vi.fn((token: string) => `enc(${token})`),
}));

import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getWorkspaceForUser } from "@/lib/workspaces";
import {
  exchangeGoogleCode,
  fetchYouTubeChannel,
  googleConfigured,
} from "@/lib/youtube";
import { GET } from "./route";

const getSession = auth.api.getSession as unknown as Mock;
const sqlMock = sql as unknown as Mock;
const workspaceMock = getWorkspaceForUser as unknown as Mock;
const exchangeMock = exchangeGoogleCode as unknown as Mock;
const channelMock = fetchYouTubeChannel as unknown as Mock;
const configured = googleConfigured as unknown as Mock;

const STATE = "state-token";
const TOKEN = {
  accessToken: "yt-access",
  refreshToken: "yt-refresh",
  scope: ["youtube.upload"],
  expiresAt: "2026-11-10T00:00:00.000Z",
};

function callbackRequest(
  params: Record<string, string>,
  cookies: Record<string, string> = {}
): NextRequest {
  const url = new URL("http://localhost:3005/api/youtube/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const cookie = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  return new NextRequest(url, { headers: cookie ? { cookie } : {} });
}

const grant = { code: "auth-code", state: STATE };

function grantedRequest(cookies: Record<string, string> = {}): NextRequest {
  return callbackRequest(grant, { yt_oauth_state: STATE, ...cookies });
}

function redirectTo(res: Response): URL {
  const location = res.headers.get("location");
  expect(location, "expected a redirect Location").toBeTruthy();
  return new URL(location!);
}

function cookieJar(res: Response): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      // Next URI-encodes cookie values; the request side decodes them back.
      jar[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return jar;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "u1" } });
  workspaceMock.mockResolvedValue({ id: "ws_1" });
  configured.mockReturnValue(true);
  exchangeMock.mockResolvedValue(TOKEN);
  channelMock.mockResolvedValue({ id: "chan_1", title: "Desk" });
  sqlMock.mockResolvedValue([]);
});

describe("GET /api/youtube/callback", () => {
  it("returns a denied grant to the page that started it", async () => {
    const res = await GET(
      callbackRequest({ error: "access_denied" }, { yt_oauth_next: "/platforms" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("google")).toBe("denied");
    expect(cookieJar(res).yt_oauth_next).toBe("");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it.each(["//evil.com", "https://evil.com"])(
    "never redirects failures to %s",
    async (next) => {
      const res = await GET(
        callbackRequest({ error: "access_denied" }, { yt_oauth_next: next })
      );

      const url = redirectTo(res);
      expect(url.origin).toBe("http://localhost:3005");
      expect(url.pathname).toBe("/youtube");
      expect(url.searchParams.get("google")).toBe("denied");
    }
  );

  it("reports unconfigured to the origin without exchanging a code", async () => {
    configured.mockReturnValue(false);

    const res = await GET(callbackRequest({}, { yt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("google")).toBe("unconfigured");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("rejects a state value that does not match the connect cookie", async () => {
    const res = await GET(
      callbackRequest(
        { code: "auth-code", state: "forged-state!" },
        { yt_oauth_state: STATE, yt_oauth_next: "/platforms" }
      )
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("google")).toBe("state");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("requires an authorization code after the state check", async () => {
    const res = await GET(
      callbackRequest({ state: STATE }, { yt_oauth_state: STATE, yt_oauth_next: "/platforms" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("google")).toBe("error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("reports an error rather than sign-in when the session vanished mid-flow", async () => {
    getSession.mockResolvedValue(null);

    const res = await GET(grantedRequest({ yt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("google")).toBe("error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("lands a successful connection in the YouTube studio", async () => {
    const res = await GET(grantedRequest({ yt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/youtube");
    expect(url.searchParams.get("google")).toBe("connected");
    const jar = cookieJar(res);
    expect(jar.yt_oauth_state).toBe("");
    expect(jar.yt_oauth_next).toBe("");
  });

  it("stores the channel grant", async () => {
    await GET(grantedRequest());

    const insert = sqlMock.mock.calls.find((call) =>
      String(call[0]).includes("youtube_connections")
    );
    expect(insert).toBeDefined();
  });

  it("stays connected when the channel probe fails", async () => {
    channelMock.mockRejectedValue(new Error("probe failed"));

    const res = await GET(grantedRequest({ yt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/youtube");
    expect(url.searchParams.get("google")).toBe("connected");
  });

  it("reports an exchange failure at the origin", async () => {
    exchangeMock.mockRejectedValue(new Error("bad code"));

    const res = await GET(grantedRequest({ yt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("google")).toBe("error");
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
