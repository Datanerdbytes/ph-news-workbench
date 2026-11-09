import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/workspaces", () => ({ getWorkspaceForUser: vi.fn() }));
vi.mock("@/lib/facebook", () => ({
  exchangeCodeForToken: vi.fn(),
  exchangeForLongLivedToken: vi.fn(),
  facebookConfigured: vi.fn(),
  fetchGrantedScopes: vi.fn(),
  fetchPages: vi.fn(),
  redactTokens: vi.fn((message: string) => message),
  selectPage: vi.fn(),
}));
vi.mock("@/lib/facebook-token", () => ({
  encryptToken: vi.fn((token: string) => `enc(${token})`),
}));
vi.mock("@/lib/notifications", () => ({
  notifyWorkspace: vi.fn(),
  clearNotificationsByDedupeKey: vi.fn(),
  TOKEN_INVALID_DEDUPE_KEY: "facebook-token-invalid",
}));

import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getWorkspaceForUser } from "@/lib/workspaces";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  facebookConfigured,
  fetchGrantedScopes,
  fetchPages,
  selectPage,
} from "@/lib/facebook";
import {
  clearNotificationsByDedupeKey,
  notifyWorkspace,
} from "@/lib/notifications";
import { GET } from "./route";

const getSession = auth.api.getSession as unknown as Mock;
const sqlMock = sql as unknown as Mock;
const workspaceMock = getWorkspaceForUser as unknown as Mock;
const codeExchange = exchangeCodeForToken as unknown as Mock;
const longExchange = exchangeForLongLivedToken as unknown as Mock;
const configured = facebookConfigured as unknown as Mock;
const scopesMock = fetchGrantedScopes as unknown as Mock;
const pagesMock = fetchPages as unknown as Mock;
const selectPageMock = selectPage as unknown as Mock;
const notifyMock = notifyWorkspace as unknown as Mock;
const clearAlertsMock = clearNotificationsByDedupeKey as unknown as Mock;

const STATE = "state-token";
const PAGE = {
  id: "1588780184320833",
  name: "NeuralVerse",
  accessToken: "page-token",
  picture: null,
};

function callbackRequest(
  params: Record<string, string>,
  cookies: Record<string, string> = {}
): NextRequest {
  const url = new URL("http://localhost:3005/api/facebook/callback");
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
  return callbackRequest(grant, { fb_oauth_state: STATE, ...cookies });
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
  codeExchange.mockResolvedValue("short-token");
  longExchange.mockResolvedValue("long-token");
  pagesMock.mockResolvedValue([PAGE]);
  scopesMock.mockResolvedValue(["pages_show_list"]);
  selectPageMock.mockReturnValue(PAGE);
  sqlMock.mockResolvedValue([]);
  notifyMock.mockResolvedValue(undefined);
  clearAlertsMock.mockResolvedValue(undefined);
});

describe("GET /api/facebook/callback", () => {
  it("returns a denied grant to the page that started it", async () => {
    const res = await GET(
      callbackRequest({ error: "access_denied" }, { fb_oauth_next: "/platforms" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("facebook")).toBe("denied");
    const jar = cookieJar(res);
    expect(jar.fb_oauth_state).toBe("");
    expect(jar.fb_oauth_next).toBe("");
    expect(jar.fb_oauth_channel).toBe("");
    expect(codeExchange).not.toHaveBeenCalled();
  });

  it("maps any other OAuth error to the generic outcome", async () => {
    const res = await GET(
      callbackRequest({ error: "server_error" }, { fb_oauth_next: "/settings" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/settings");
    expect(url.searchParams.get("facebook")).toBe("error");
  });

  it.each(["//evil.com", "https://evil.com"])(
    "never redirects failures to %s",
    async (next) => {
      const res = await GET(
        callbackRequest({ error: "access_denied" }, { fb_oauth_next: next })
      );

      const url = redirectTo(res);
      expect(url.origin).toBe("http://localhost:3005");
      expect(url.pathname).toBe("/");
      expect(url.searchParams.get("facebook")).toBe("denied");
    }
  );

  it("treats a callback without a state cookie as a state mismatch", async () => {
    const res = await GET(callbackRequest(grant));

    expect(redirectTo(res).searchParams.get("facebook")).toBe("state");
    expect(codeExchange).not.toHaveBeenCalled();
  });

  it("rejects a state value that does not match the connect cookie", async () => {
    const res = await GET(
      callbackRequest(
        { code: "auth-code", state: "forged-state!" },
        { fb_oauth_state: STATE, fb_oauth_next: "/platforms" }
      )
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("facebook")).toBe("state");
    expect(codeExchange).not.toHaveBeenCalled();
  });

  it("requires an authorization code after the state check", async () => {
    const res = await GET(
      callbackRequest({ state: STATE }, { fb_oauth_state: STATE, fb_oauth_next: "/platforms" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("facebook")).toBe("error");
    expect(codeExchange).not.toHaveBeenCalled();
  });

  it("sends a signed-out callback to sign-in", async () => {
    getSession.mockResolvedValue(null);

    const res = await GET(grantedRequest());

    expect(redirectTo(res).pathname).toBe("/login");
    expect(codeExchange).not.toHaveBeenCalled();
  });

  it("lands a successful connection in the Facebook composer", async () => {
    const res = await GET(grantedRequest({ fb_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/post");
    expect(url.searchParams.get("facebook")).toBe("connected");
    expect(cookieJar(res).fb_oauth_next).toBe("");
  });

  it("stores the Page and resolves stale token alerts", async () => {
    await GET(grantedRequest());

    expect(
      sqlMock.mock.calls.some((call) =>
        String(call[0]).includes("facebook_connections")
      )
    ).toBe(true);
    expect(
      sqlMock.mock.calls.some((call) =>
        String(call[0]).includes("facebook_pages")
      )
    ).toBe(true);
    expect(clearAlertsMock).toHaveBeenCalledWith("ws_1", "facebook-token-invalid");
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "facebook_reconnected" })
    );
  });

  it("routes an Instagram-scoped grant to the Instagram composer", async () => {
    const res = await GET(
      grantedRequest({ fb_oauth_channel: "instagram", fb_oauth_next: "/platforms" })
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/instagram");
    expect(url.searchParams.get("instagram")).toBe("connected");
    expect(url.searchParams.get("facebook")).toBeNull();
  });

  it("keeps Instagram failures tagged as Instagram outcomes", async () => {
    const res = await GET(
      callbackRequest(
        { error: "access_denied" },
        { fb_oauth_channel: "instagram", fb_oauth_next: "/platforms" }
      )
    );

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("instagram")).toBe("denied");
    expect(url.searchParams.get("facebook")).toBeNull();
  });

  it("reports an account with no Pages without storing anything", async () => {
    pagesMock.mockResolvedValue([]);

    const res = await GET(grantedRequest({ fb_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("facebook")).toBe("no_pages");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("reports a missing configured Page", async () => {
    selectPageMock.mockReturnValue(null);

    const res = await GET(grantedRequest({ fb_oauth_next: "/settings" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/settings");
    expect(url.searchParams.get("facebook")).toBe("page_not_found");
  });

  it("reports an exchange failure at the origin instead of crashing", async () => {
    codeExchange.mockRejectedValue(new Error("bad code"));

    const res = await GET(grantedRequest({ fb_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("facebook")).toBe("error");
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "facebook_oauth_failed" })
    );
  });

  it("reports unconfigured when the app credentials are missing", async () => {
    configured.mockReturnValue(false);

    const res = await GET(callbackRequest({}, { fb_oauth_next: "/platforms" }));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("facebook")).toBe("unconfigured");
  });
});
