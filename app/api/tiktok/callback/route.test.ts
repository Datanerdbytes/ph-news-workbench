import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/workspaces", () => ({ getWorkspaceForUser: vi.fn() }));
vi.mock("@/lib/tiktok", () => ({
  exchangeTikTokCode: vi.fn(),
  fetchTikTokUser: vi.fn(),
  encryptTikTokSecret: vi.fn((token: string) => `enc(${token})`),
  tiktokConfigured: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getWorkspaceForUser } from "@/lib/workspaces";
import {
  exchangeTikTokCode,
  fetchTikTokUser,
  tiktokConfigured,
} from "@/lib/tiktok";
import { GET } from "./route";

const getSession = auth.api.getSession as unknown as Mock;
const sqlMock = sql as unknown as Mock;
const workspaceMock = getWorkspaceForUser as unknown as Mock;
const exchangeMock = exchangeTikTokCode as unknown as Mock;
const userMock = fetchTikTokUser as unknown as Mock;
const configured = tiktokConfigured as unknown as Mock;

const STATE = "state-token";
const TOKEN = {
  accessToken: "tt-access",
  refreshToken: "tt-refresh",
  scope: ["video.publish"],
  expiresAt: "2026-11-10T00:00:00.000Z",
};

function callbackRequest(
  params: Record<string, string>,
  cookies: Record<string, string> = {}
): NextRequest {
  const url = new URL("http://localhost:3005/api/tiktok/callback");
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
  return callbackRequest(grant, {
    tt_oauth_state: STATE,
    tt_pkce_verifier: "verifier-1",
    ...cookies,
  });
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
  userMock.mockResolvedValue({ id: "tt-user", name: "Desk" });
  sqlMock.mockResolvedValue([]);
});

describe("GET /api/tiktok/callback", () => {
  it("returns a denied grant to the page that started it", async () => {
    const res = await GET(
      callbackRequest({ error: "access_denied" }, { tt_oauth_next: "/platforms" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("platform")).toBe("denied");
    expect(cookieJar(res).tt_oauth_next).toBe("");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it.each(["//evil.com", "https://evil.com"])(
    "never redirects failures to %s",
    async (next) => {
      const res = await GET(
        callbackRequest({ error: "access_denied" }, { tt_oauth_next: next })
      );

      const url = redirectTo(res);
      expect(url.origin).toBe("http://localhost:3005");
      expect(url.pathname).toBe("/tiktok");
      expect(url.searchParams.get("platform")).toBe("denied");
    }
  );

  it("reports unconfigured to the origin without exchanging a code", async () => {
    configured.mockReturnValue(false);

    const res = await GET(callbackRequest({}, { tt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("platform")).toBe("unconfigured");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("rejects a callback missing the PKCE verifier", async () => {
    const res = await GET(
      grantedRequest({ tt_pkce_verifier: "", tt_oauth_next: "/platforms" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("platform")).toBe("state");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("rejects a state value that does not match the connect cookie", async () => {
    const res = await GET(
      callbackRequest(
        { code: "auth-code", state: "forged-state!" },
        {
          tt_oauth_state: STATE,
          tt_pkce_verifier: "verifier-1",
          tt_oauth_next: "/platforms",
        }
      )
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("platform")).toBe("state");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("requires an authorization code after the state check", async () => {
    const res = await GET(
      callbackRequest(
        { state: STATE },
        {
          tt_oauth_state: STATE,
          tt_pkce_verifier: "verifier-1",
          tt_oauth_next: "/platforms",
        }
      )
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("platform")).toBe("error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("reports an error rather than sign-in when the session vanished mid-flow", async () => {
    getSession.mockResolvedValue(null);

    const res = await GET(grantedRequest({ tt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("platform")).toBe("error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("lands a successful connection in the TikTok studio", async () => {
    const res = await GET(grantedRequest({ tt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/tiktok");
    expect(url.searchParams.get("platform")).toBe("connected");
    const jar = cookieJar(res);
    expect(jar.tt_oauth_state).toBe("");
    expect(jar.tt_pkce_verifier).toBe("");
    expect(jar.tt_oauth_next).toBe("");
  });

  it("exchanges the code against the stored PKCE verifier", async () => {
    await GET(grantedRequest());

    expect(exchangeMock).toHaveBeenCalledWith("auth-code", "verifier-1");
    const insert = sqlMock.mock.calls.find((call) =>
      String(call[0]).includes("tiktok_connections")
    );
    expect(insert).toBeDefined();
  });

  it("stays connected when the profile probe fails", async () => {
    userMock.mockRejectedValue(new Error("probe failed"));

    const res = await GET(grantedRequest({ tt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/tiktok");
    expect(url.searchParams.get("platform")).toBe("connected");
  });

  it("reports an exchange failure at the origin", async () => {
    exchangeMock.mockRejectedValue(new Error("bad code"));

    const res = await GET(grantedRequest({ tt_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("platform")).toBe("error");
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
