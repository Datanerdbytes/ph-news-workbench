import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, requireWorkspaceMock } = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), { unsafe: (fragment: string) => fragment });
  return {
    sqlMock: sql,
    requireWorkspaceMock: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ sql: sqlMock }));
vi.mock("@/lib/session", () => ({
  requireWorkspace: requireWorkspaceMock,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

import { GET } from "./route";

const access = { user: { id: "u1" }, workspace: { id: "ws1" } };

function draft(id: number) {
  return {
    id,
    news_item_id: id,
    status: "drafted",
    error_message: null,
    correlation_id: `c-${id}`,
    created_at: "2026-11-13T00:00:00Z",
    news_title: `Story ${id}`,
  };
}

function queryText(call: unknown[]) {
  return (call[0] as string[]).join("?");
}

function queryParams(call: unknown[]) {
  return call.slice(1);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockResolvedValue(access);
});

describe("GET /api/drafts", () => {
  it("returns the first page with a cursor when more records exist", async () => {
    sqlMock.mockResolvedValueOnce([draft(101), draft(100), draft(99), draft(98)]);
    const res = await GET(new Request("http://localhost/api/drafts?limit=3"));
    const data = await res.json();
    expect(data.drafts).toHaveLength(3);
    expect(data.hasMore).toBe(true);
    expect(data.nextCursor).toBe(99);
  });

  it("returns hasMore=false and a null cursor on the last page", async () => {
    sqlMock.mockResolvedValueOnce([draft(2), draft(1)]);
    const res = await GET(new Request("http://localhost/api/drafts?limit=3"));
    const data = await res.json();
    expect(data.hasMore).toBe(false);
    expect(data.nextCursor).toBeNull();
    expect(data.drafts).toHaveLength(2);
  });

  it("filters by the before cursor on later pages", async () => {
    sqlMock.mockResolvedValueOnce([draft(50), draft(49)]);
    await GET(new Request("http://localhost/api/drafts?before=51"));
    expect(queryText(sqlMock.mock.calls[0])).toContain("d.id <");
    expect(queryParams(sqlMock.mock.calls[0])).toContain(51);
  });

  it("clamps the page size at 200", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await GET(new Request("http://localhost/api/drafts?limit=5000"));
    expect(queryParams(sqlMock.mock.calls[0])).toContain(201);
  });
});
