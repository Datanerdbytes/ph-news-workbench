import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/facebook", () => ({
  facebookConfigured: vi.fn(),
  buildAuthorizationUrl: vi.fn(
    () => "https://www.facebook.com/dialog/oauth?client_id=app&scope=ig"
  ),
}));
vi.mock("@/lib/instagram", () => ({
  INSTAGRAM_SCOPES: ["instagram_basic", "instagram_content_publish"],
}));

import { auth } from "@/lib/auth";
import { facebookConfigured } from "@/lib/facebook";
import { GET } from "./route";

const getSession = auth.api.getSession as unknown as Mock;
const configured = facebookConfigured as unknown as Mock;

function requestFor(next?: string): NextRequest {
  const url = new URL("http://localhost:3005/api/instagram/connect");
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

describe("GET /api/instagram/connect", () => {
  it("sends signed-out visitors to sign-in without minting OAuth cookies", async () => {
    getSession.mockResolvedValue(null);

    const res = await GET(requestFor("/platforms"));

    expect(redirectTo(res).pathname).toBe("/login");
    expect(cookieJar(res)).toEqual({});
  });

  it("sends an unconfigured app straight to the Instagram studio", async () => {
    configured.mockReturnValue(false);

    const res = await GET(requestFor("/platforms"));

    const url = redirectTo(res);
    expect(url.pathname).toBe("/instagram");
    expect(url.search).toBe("");
    expect(cookieJar(res)).toEqual({});
  });

  it("starts the Meta dialog with the Instagram channel and landing path", async () => {
    const res = await GET(requestFor("/platforms"));

    expect(res.headers.get("location")).toContain("facebook.com/dialog");
    const jar = cookieJar(res);
    expect(jar.fb_oauth_next).toBe("/platforms");
    expect(jar.fb_oauth_channel).toBe("instagram");
    expect(jar.fb_oauth_state).toBeTruthy();
  });

  it("keeps the Instagram channel but drops a protocol-relative landing path", async () => {
    const res = await GET(requestFor("//evil.com"));

    expect(res.headers.get("location")).toContain("facebook.com/dialog");
    const jar = cookieJar(res);
    expect(jar.fb_oauth_next).toBeUndefined();
    expect(jar.fb_oauth_channel).toBe("instagram");
  });

  it("does not store a next cookie when none was requested", async () => {
    const res = await GET(requestFor());

    const jar = cookieJar(res);
    expect(jar.fb_oauth_next).toBeUndefined();
    expect(jar.fb_oauth_channel).toBe("instagram");
  });
});
