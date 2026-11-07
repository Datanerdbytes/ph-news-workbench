import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireWorkspace: vi.fn(),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
}));

import { sql } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { POST } from "./route";

const sqlMock = sql as unknown as Mock;
const requireWorkspaceMock = requireWorkspace as unknown as Mock;

const access = {
  user: { id: "u1" },
  workspace: { id: "ws_1", role: "owner" },
};

function post(body: unknown) {
  return new Request("http://localhost/api/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([]);
  requireWorkspaceMock.mockReset();
  requireWorkspaceMock.mockResolvedValue(access);
});

describe("POST /api/notifications/read", () => {
  it("returns 401 without a workspace session", async () => {
    requireWorkspaceMock.mockResolvedValueOnce(null);

    const res = await POST(post({ all: true }));

    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("marks every unread row read for { all: true }", async () => {
    const res = await POST(post({ all: true }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(data.ok).toBe(true);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const [query, userId] = sqlMock.mock.calls[0];
    expect(String(query)).toContain("UPDATE notifications");
    expect(String(query)).toContain("read_at IS NULL");
    expect(String(query)).not.toContain("AND id =");
    expect(userId).toBe("u1");
  });

  it("marks a single row read by id, user-scoped", async () => {
    const res = await POST(post({ id: 7 }));

    expect(res.status).toBe(200);
    const [query, userId, id] = sqlMock.mock.calls[0];
    expect(String(query)).toContain("AND id =");
    expect(userId).toBe("u1");
    expect(id).toBe(7);
  });

  it("rejects a body without an id or all flag", async () => {
    const res = await POST(post({}));

    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("rejects a zero or negative id", async () => {
    for (const bad of [{ id: 0 }, { id: -3 }, { id: "abc" }]) {
      const res = await POST(post(bad));
      expect(res.status).toBe(400);
    }
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await POST(post("this is not json"));

    expect(res.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
