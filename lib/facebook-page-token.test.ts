import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import { encryptToken } from "./facebook-token";
import { getPrimaryPage, resolvePageToken } from "./facebook-page-token";

const sqlMock = sql as unknown as Mock;

type PageTokenRow = { page_id: string; access_token: string };

/**
 * Dispatch rows per query shape: managed-by-id, primary managed, legacy-by-id,
 * legacy fallback — mirroring the resolver's priority chain.
 */
function useDb(overrides: {
  managedById?: PageTokenRow[];
  primaryManaged?: PageTokenRow[];
  legacyById?: PageTokenRow[];
  legacyAny?: PageTokenRow[];
}) {
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("facebook_pages")) {
      return query.includes("page_id =")
        ? (overrides.managedById ?? [])
        : (overrides.primaryManaged ?? []);
    }
    if (query.includes("facebook_connections")) {
      return query.includes("page_id =")
        ? (overrides.legacyById ?? [])
        : (overrides.legacyAny ?? []);
    }
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-123");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolvePageToken", () => {
  it("decrypts a managed page token by page id", async () => {
    useDb({ managedById: [{ page_id: "p1", access_token: encryptToken("tok-managed") }] });

    await expect(resolvePageToken("ws1", "p1")).resolves.toBe("tok-managed");
  });

  it("falls through to the legacy connection when decryption fails", async () => {
    useDb({
      managedById: [{ page_id: "p1", access_token: "not-encrypted" }],
      legacyById: [{ page_id: "p1", access_token: encryptToken("tok-legacy") }],
    });

    await expect(resolvePageToken("ws1", "p1")).resolves.toBe("tok-legacy");
  });

  it("uses the primary managed page when the requested page is unknown", async () => {
    useDb({
      primaryManaged: [{ page_id: "p0", access_token: encryptToken("tok-primary") }],
    });

    await expect(resolvePageToken("ws1", "p9")).resolves.toBe("tok-primary");
  });

  it("resolves the primary page directly when no page id is given", async () => {
    useDb({
      primaryManaged: [{ page_id: "p0", access_token: encryptToken("tok-primary") }],
    });

    await expect(resolvePageToken("ws1", null)).resolves.toBe("tok-primary");
    const queries = sqlMock.mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join(" ")
    );
    expect(queries.some((text) => text.includes("facebook_connections"))).toBe(false);
  });

  it("returns null when nothing is connected", async () => {
    useDb({});
    await expect(resolvePageToken("ws1", "p1")).resolves.toBeNull();
  });
});

describe("getPrimaryPage", () => {
  it("prefers the primary managed page", async () => {
    useDb({
      primaryManaged: [{ page_id: "p0", access_token: encryptToken("tok-primary") }],
      legacyAny: [{ page_id: "pL", access_token: encryptToken("tok-legacy") }],
    });

    await expect(getPrimaryPage("ws1")).resolves.toEqual({
      pageId: "p0",
      token: "tok-primary",
    });
  });

  it("falls back to the legacy connection", async () => {
    useDb({
      legacyAny: [{ page_id: "pL", access_token: encryptToken("tok-legacy") }],
    });

    await expect(getPrimaryPage("ws1")).resolves.toEqual({
      pageId: "pL",
      token: "tok-legacy",
    });
  });

  it("skips an undecryptable primary and returns null when nothing works", async () => {
    useDb({
      primaryManaged: [{ page_id: "p0", access_token: "garbage" }],
    });
    await expect(getPrimaryPage("ws1")).resolves.toBeNull();

    useDb({
      primaryManaged: [{ page_id: "p0", access_token: "garbage" }],
      legacyAny: [{ page_id: "pL", access_token: encryptToken("tok-legacy") }],
    });
    await expect(getPrimaryPage("ws1")).resolves.toEqual({
      pageId: "pL",
      token: "tok-legacy",
    });
  });
});
