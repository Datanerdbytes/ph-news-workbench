import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  clearOAuthCookies,
  resolveReturnPath,
  returnUrl,
  safeNext,
} from "./oauth-return";

describe("safeNext", () => {
  it("accepts same-origin paths verbatim", () => {
    for (const path of ["/", "/platforms", "/settings?tab=publishing", "/a?b=/c"]) {
      expect(safeNext(path)).toBe(path);
    }
  });

  it.each([
    null,
    "",
    "//evil.com",
    "https://evil.com",
    "evil.com",
    "\\evil.com",
    " /platforms",
    "javascript:alert(1)",
  ])("rejects %s", (value) => {
    expect(safeNext(value)).toBeNull();
  });
});

describe("resolveReturnPath", () => {
  it("lands a completed grant in the platform studio, ignoring the origin", () => {
    expect(resolveReturnPath("/platforms", "connected", "/post", "/")).toBe(
      "/post"
    );
  });

  it("returns every other outcome to the sanitized origin path", () => {
    expect(resolveReturnPath("/platforms", "denied", "/post", "/")).toBe(
      "/platforms"
    );
    expect(resolveReturnPath("/platforms", "state", "/post", "/")).toBe(
      "/platforms"
    );
  });

  it("falls back to the platform default when the path is missing or unsafe", () => {
    expect(resolveReturnPath(null, "error", "/youtube", "/youtube")).toBe(
      "/youtube"
    );
    expect(
      resolveReturnPath("//evil.com", "error", "/youtube", "/youtube")
    ).toBe("/youtube");
  });
});

describe("returnUrl", () => {
  it("stamps the outcome onto the path at the request origin", () => {
    const url = returnUrl(
      new Request("http://localhost:3005/api/facebook/callback?code=x"),
      "/platforms",
      "facebook",
      "denied"
    );

    expect(url.origin).toBe("http://localhost:3005");
    expect(url.pathname).toBe("/platforms");
    expect(url.searchParams.get("facebook")).toBe("denied");
  });
});

describe("clearOAuthCookies", () => {
  it("expires the named cookies and leaves unrelated ones alone", () => {
    const response = NextResponse.redirect("http://localhost:3005/post");
    response.cookies.set("session", "abc", { path: "/" });

    clearOAuthCookies(response, ["fb_oauth_state", "fb_oauth_next"]);

    const headers = response.headers.getSetCookie();
    for (const name of ["fb_oauth_state", "fb_oauth_next"]) {
      const cleared = headers.find((header) => header.startsWith(`${name}=`));
      expect(cleared, `${name} should be cleared`).toMatch(/Max-Age=0/i);
    }
    expect(headers.some((header) => header.startsWith("session=abc"))).toBe(
      true
    );
  });
});
