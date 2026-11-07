import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireWorkspace: vi.fn(),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
}));

import { sql } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { GET } from "./route";

const sqlMock = sql as unknown as Mock;
const requireWorkspaceMock = requireWorkspace as unknown as Mock;

const access = {
  user: { id: "u1" },
  workspace: { id: "ws_1", role: "owner" },
};

function row(id: number) {
  return {
    id: String(id),
    type: "scheduled_publish_success",
    title: `Notification ${id}`,
    body: null,
    link: null,
    readAt: null,
    createdAt: "2026-11-07T12:00:00Z",
  };
}

/** Dispatch on the query text — the nested cursor fragment also hits the mock. */
function mockQueries(rows: unknown[], unread: number) {
  sqlMock.mockImplementation((strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("count(*)")) return Promise.resolve([{ unread }]);
    if (query.includes("FROM notifications")) return Promise.resolve(rows);
    return Promise.resolve([]);
  });
}

function callFor(fragment: string) {
  const call = sqlMock.mock.calls.find((candidate) =>
    String(candidate[0]).includes(fragment)
  );
  expect(call, `expected a query containing "${fragment}"`).toBeDefined();
  return call!;
}

beforeEach(() => {
  sqlMock.mockReset();
  requireWorkspaceMock.mockReset();
  requireWorkspaceMock.mockResolvedValue(access);
});

describe("GET /api/notifications", () => {
  it("returns 401 without a workspace session", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/notifications"));

    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns rows, the unread count, and no cursor on a short page", async () => {
    mockQueries([row(30), row(20)], 2);

    const res = await GET(new Request("http://localhost/api/notifications"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(data.rows).toHaveLength(2);
    expect(data.unread).toBe(2);
    expect(data.hasMore).toBe(false);
    expect(data.nextCursor).toBeNull();
    expect(data.rows[0].id).toBe("30");
  });

  it("paginates by id cursor and reports hasMore", async () => {
    mockQueries([row(30), row(20), row(10)], 3);

    const res = await GET(
      new Request("http://localhost/api/notifications?limit=2&before=42")
    );
    const data = await res.json();

    expect(data.rows).toHaveLength(2); // one extra row powers hasMore
    expect(data.rows.map((r: { id: string }) => r.id)).toEqual(["30", "20"]);
    expect(data.hasMore).toBe(true);
    expect(data.nextCursor).toBe(20);
    expect(data.unread).toBe(3);

    const pageQuery = callFor("ORDER BY id DESC");
    expect(pageQuery[1]).toBe("u1"); // rows are user-scoped
    expect(pageQuery[pageQuery.length - 1]).toBe(3); // limit + 1

    const cursorFragment = callFor("id <");
    expect(cursorFragment[cursorFragment.length - 1]).toBe(42);
  });

  it("clamps an oversized limit", async () => {
    mockQueries([], 0);

    await GET(new Request("http://localhost/api/notifications?limit=999"));

    const pageQuery = callFor("ORDER BY id DESC");
    expect(pageQuery[pageQuery.length - 1]).toBe(51); // 50 + 1
  });

  it("ignores a non-numeric cursor", async () => {
    mockQueries([row(30)], 1);

    await GET(new Request("http://localhost/api/notifications?before=abc"));

    expect(sqlMock.mock.calls.some((c) => String(c[0]).includes("id <"))).toBe(
      false
    );
  });
});
