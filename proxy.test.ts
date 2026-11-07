import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

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
