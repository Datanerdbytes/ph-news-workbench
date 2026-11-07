import { afterEach, describe, expect, it, vi } from "vitest";
import { hasCronSecret, isCronRequest } from "./cron";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasCronSecret", () => {
  it("is false when the secret is unset or blank", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(hasCronSecret()).toBe(false);
    vi.stubEnv("CRON_SECRET", "   ");
    expect(hasCronSecret()).toBe(false);
  });

  it("is true when a secret is configured", () => {
    vi.stubEnv("CRON_SECRET", " s3cret ");
    expect(hasCronSecret()).toBe(true);
  });
});

describe("isCronRequest", () => {
  const request = (authorization?: string) =>
    new Request("https://workbench.test/api/cron", {
      headers: authorization ? { authorization } : {},
    });

  it("rejects every request when no secret is configured", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronRequest(request("Bearer anything"))).toBe(false);
    expect(isCronRequest(request())).toBe(false);
  });

  it("accepts only the exact Bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronRequest(request("Bearer s3cret"))).toBe(true);
    expect(isCronRequest(request("Bearer wrong"))).toBe(false);
    expect(isCronRequest(request("s3cret"))).toBe(false);
    expect(isCronRequest(request())).toBe(false);
  });
});
