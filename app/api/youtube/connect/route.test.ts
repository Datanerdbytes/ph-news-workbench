import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/youtube", () => ({
  googleConfigured: vi.fn(),
  buildGoogleAuthorizationUrl: vi.fn(
    () => "https://accounts.google.com/o/oauth2/v2/auth?client_id=app"
  ),
}));

import { auth } from "@/lib/auth";
import { googleConfigured } from "@/lib/youtube";
import { GET } from "./route";

const getSession = auth.api.getSession as unknown as Mock;
const configured = googleConfigured as unknown as Mock;

function requestFor(next?: string): NextRequest {
  const url = new URL("http://localhost:3005/api/youtube/connect");
  if (next !== undefined) url.searchParams.set("next", next);
  return new NextRequest(url, {
    headers: { cookie: "better-auth.session_token=abc" },
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
  getSession.mockReset().mockResolvedValue({ user: { id: "u1" } });
  configured.mockReset().mockReturnValue(true);
});

describe("GET /api/youtube/connect", () => {
  it("sends signed-out visitors to sign-in without minting OAuth cookies", async () => {
    getSession.mockResolvedValue(null);

    const res = await GET(requestFor("/platforms"));

    expect(redirectTo(res).pathname).toBe("/login");
    expect(cookieJar(res)).toEqual({});
  });

  it("starts the Google dialog and remembers a same-origin landing path", async () => {
    const res = await GET(requestFor("/platforms"));

    expect(res.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=app"
    );
    const jar = cookieJar(res);
    expect(jar.yt_oauth_next).toBe("/platforms");
    expect(jar.yt_oauth_state).toBeTruthy();
  });

  it("does not store a next cookie when none was requested", async () => {
    const res = await GET(requestFor());

    expect(res.headers.get("location")).toContain("accounts.google.com");
    expect(cookieJar(res).yt_oauth_next).toBeUndefined();
  });

  it("reports unconfigured back to a same-origin landing path", async () => {
    configured.mockReturnValue(false);

    const res = await GET(requestFor("/platforms"));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("google")).toBe("unconfigured");
  });

  it.each(["//evil.com", "https://evil.com", "evil.com"])(
    "falls back to the YouTube studio instead of redirecting to %s",
    async (next) => {
      configured.mockReturnValue(false);

      const res = await GET(requestFor(next));

      const url = redirectTo(res);
      expect(url.origin).toBe("http://localhost:3005");
      expect(url.pathname).toBe("/youtube");
      expect(url.searchParams.get("google")).toBe("unconfigured");
    }
  );

  it("defaults the unconfigured result to the YouTube studio", async () => {
    configured.mockReturnValue(false);

    const res = await GET(requestFor());

    expect(redirectTo(res).pathname).toBe("/youtube");
  });

  it.each(["//evil.com", "https://evil.com"])(
    "rejects %s as a landing path while still starting OAuth",
    async (next) => {
      const res = await GET(requestFor(next));

      expect(res.headers.get("location")).toContain("accounts.google.com");
      expect(cookieJar(res).yt_oauth_next).toBeUndefined();
      expect(cookieJar(res).yt_oauth_state).toBeTruthy();
    }
  );
});
