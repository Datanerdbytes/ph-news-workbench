import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/facebook", () => ({
  facebookConfigured: vi.fn(),
  buildAuthorizationUrl: vi.fn(
    () => "https://www.facebook.com/dialog/oauth?client_id=app"
  ),
}));

import { auth } from "@/lib/auth";
import { facebookConfigured } from "@/lib/facebook";
import { GET } from "./route";

const getSession = auth.api.getSession as unknown as Mock;
const configured = facebookConfigured as unknown as Mock;

function requestFor(next?: string): NextRequest {
  const url = new URL("http://localhost:3005/api/facebook/connect");
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

describe("GET /api/facebook/connect", () => {
  it("sends signed-out visitors to sign-in without minting OAuth cookies", async () => {
    getSession.mockResolvedValue(null);

    const res = await GET(requestFor("/platforms"));

    expect(res.status).toBe(307);
    expect(redirectTo(res).pathname).toBe("/login");
    expect(cookieJar(res)).toEqual({});
  });

  it("starts the Meta dialog and remembers a same-origin landing path", async () => {
    const res = await GET(requestFor("/platforms"));

    expect(res.headers.get("location")).toBe(
      "https://www.facebook.com/dialog/oauth?client_id=app"
    );
    const jar = cookieJar(res);
    expect(jar.fb_oauth_next).toBe("/platforms");
    expect(jar.fb_oauth_state).toBeTruthy();
  });

  it("does not store a next cookie when none was requested", async () => {
    const res = await GET(requestFor());

    expect(res.headers.get("location")).toContain("facebook.com/dialog");
    const jar = cookieJar(res);
    expect(jar.fb_oauth_next).toBeUndefined();
    expect(jar.fb_oauth_state).toBeTruthy();
  });

  it.each(["//evil.com", "https://evil.com", "evil.com"])(
    "rejects %s as a landing path while still starting OAuth",
    async (next) => {
      const res = await GET(requestFor(next));

      expect(res.headers.get("location")).toContain("facebook.com/dialog");
      expect(cookieJar(res).fb_oauth_next).toBeUndefined();
      expect(cookieJar(res).fb_oauth_state).toBeTruthy();
    }
  );

  it("reports unconfigured back to a same-origin landing path", async () => {
    configured.mockReturnValue(false);

    const res = await GET(requestFor("/settings"));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/settings");
    expect(url.searchParams.get("facebook")).toBe("unconfigured");
  });

  it.each(["//evil.com", "https://evil.com"])(
    "falls back to the story queue instead of redirecting unconfigured to %s",
    async (next) => {
      configured.mockReturnValue(false);

      const res = await GET(requestFor(next));

      const url = redirectTo(res);
      expect(url.origin).toBe("http://localhost:3005");
      expect(url.pathname).toBe("/");
      expect(url.searchParams.get("facebook")).toBe("unconfigured");
    }
  );

  it("defaults the unconfigured result to the story queue", async () => {
    configured.mockReturnValue(false);

    const res = await GET(requestFor());

    const url = redirectTo(res);
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("facebook")).toBe("unconfigured");
  });
});
