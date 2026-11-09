import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

function requestFor(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://app.example.com${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function isLoginRedirect(response: ReturnType<typeof proxy>): boolean {
  return (
    response.status === 307 &&
    response.headers.get("location")?.endsWith("/login") === true
  );
}

describe("proxy auth gate", () => {
  it("redirects protected pages without a session cookie", () => {
    expect(isLoginRedirect(proxy(requestFor("/dashboard")))).toBe(true);
    expect(isLoginRedirect(proxy(requestFor("/calendar")))).toBe(true);
  });

  it("admits the bare cookie name used over HTTP (local dev)", () => {
    const response = proxy(
      requestFor("/dashboard", "better-auth.session_token=abc")
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("admits the __Secure- prefixed cookie name used over HTTPS", () => {
    const response = proxy(
      requestFor("/dashboard", "__Secure-better-auth.session_token=abc")
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps public paths and the API reachable without a session", () => {
    expect(isLoginRedirect(proxy(requestFor("/login")))).toBe(false);
    expect(isLoginRedirect(proxy(requestFor("/forgot-password")))).toBe(false);
    expect(isLoginRedirect(proxy(requestFor("/api/posts")))).toBe(false);
  });
});

describe("proxy matcher", () => {
  /** Next compiles the matcher into "path does not start with any blocked prefix". */
  function isProxied(path: string): boolean {
    const matcher = config.matcher[0];
    const blocked = /^\/\(\(\?!(.+?)\)\.\*\)$/.exec(matcher);
    if (!blocked) throw new Error(`Unexpected matcher shape: ${matcher}`);
    const prefixes = blocked[1]
      .split("|")
      .map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return !new RegExp(`^(?:${prefixes.join("|")})`).test(path.replace(/^\//, ""));
  }

  it("keeps the reel prepare route out of the proxy body buffer", () => {
    // The proxy makes Next buffer request bodies in memory (10MB by default),
    // which truncates large reel uploads before the route reads them.
    expect(isProxied("/api/reels/prepare")).toBe(false);
  });

  it("still proxies the pages and the other API routes", () => {
    expect(isProxied("/reels")).toBe(true);
    expect(isProxied("/downloads")).toBe(true);
    expect(isProxied("/api/downloads")).toBe(true);
    expect(isProxied("/_next/static/chunk.js")).toBe(false);
  });
});
