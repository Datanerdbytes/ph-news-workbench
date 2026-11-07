import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import { getWorkspaceForUser } from "./workspaces";

const sqlMock = sql as unknown as Mock;

function useDb(rows: unknown[]) {
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("JOIN workspaces")) return rows;
    return [];
  });
}

const callText = (call: unknown[]) =>
  (call[0] as TemplateStringsArray).join(" ");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getWorkspaceForUser", () => {
  it("maps the first membership row to a workspace", async () => {
    useDb([
      {
        id: "ws1",
        name: "Newsroom",
        owner_id: "u1",
        role: "editor",
        ai_model: "nvidia/nemotron-3.5-bolt-e4b",
      },
    ]);

    await expect(getWorkspaceForUser({ id: "u1", name: "Alice" })).resolves.toEqual({
      id: "ws1",
      name: "Newsroom",
      role: "editor",
      ownerId: "u1",
      aiModel: "nvidia/nemotron-3.5-bolt-e4b",
    });

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("bootstraps a personal workspace for members-less users", async () => {
    useDb([]);

    await expect(getWorkspaceForUser({ id: "u9", name: "Alice" })).resolves.toEqual({
      id: "ws_u9",
      name: "Alice's workspace",
      role: "owner",
      ownerId: "u9",
      aiModel: null,
    });

    const inserts = sqlMock.mock.calls.map(callText);
    expect(inserts.some((text) => text.includes("INSERT INTO workspaces"))).toBe(
      true
    );
    expect(
      inserts.some((text) => text.includes("INSERT INTO workspace_members"))
    ).toBe(true);

    const workspaceInsert = sqlMock.mock.calls.find((call) =>
      callText(call).includes("INSERT INTO workspaces")
    );
    expect(workspaceInsert!.slice(1)).toEqual(["ws_u9", "Alice's workspace", "u9"]);

    const memberInsert = sqlMock.mock.calls.find((call) =>
      callText(call).includes("INSERT INTO workspace_members")
    );
    // 'owner' is a SQL literal in the statement, not a bound parameter.
    expect(callText(memberInsert!)).toContain("'owner'");
    expect(memberInsert!.slice(1)).toEqual(["ws_u9", "u9"]);
  });

  it("falls back to 'Personal workspace' when the user has no name", async () => {
    useDb([]);

    await expect(getWorkspaceForUser({ id: "u9", name: "   " })).resolves.toMatchObject(
      { name: "Personal workspace", role: "owner" }
    );
  });
});
