import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireWorkspace: vi.fn(),
  unauthorized: vi.fn(() => new Response(null, { status: 401 })),
}));
vi.mock("@/lib/blob", () => ({ assertStagedBlob: vi.fn() }));
vi.mock("@/lib/publishing/instagram", () => ({
  publishInstagramImagePost: vi.fn(),
  resolveInstagramAccount: vi.fn(),
}));
vi.mock("@/lib/schedule-events", () => ({ recordScheduleEvent: vi.fn() }));

import { sql } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { assertStagedBlob } from "@/lib/blob";
import { recordScheduleEvent } from "@/lib/schedule-events";
import {
  publishInstagramImagePost,
  resolveInstagramAccount,
} from "@/lib/publishing/instagram";
import { POST } from "./route";

const sqlMock = sql as unknown as Mock;
const sessionMock = requireWorkspace as unknown as Mock;
const stageMock = assertStagedBlob as unknown as Mock;
const resolveMock = resolveInstagramAccount as unknown as Mock;
const publishMock = publishInstagramImagePost as unknown as Mock;
const eventMock = recordScheduleEvent as unknown as Mock;

const connection = {
  ok: true as const,
  account: { id: "ig1", username: "iamwowie_", picture: null },
  accessToken: "page-token",
  scopes: ["instagram_content_publish"],
  pageId: "pg1",
};

const access = {
  user: { id: "u1" },
  workspace: { id: "ws_1", role: "owner" },
};

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/instagram/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const stagedBody = {
  message: "Behind the headline",
  imageUrl:
    "https://bucket.public.blob.vercel-storage.com/instagram/img.jpg",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue(access);
  resolveMock.mockResolvedValue(connection);
  stageMock.mockResolvedValue(undefined);
  publishMock.mockResolvedValue({
    id: "ig_media_1",
    permalink: "https://www.instagram.com/p/xyz",
  });
  sqlMock.mockResolvedValue([{ id: 55, scheduled_for: "2026-11-15T09:00:00.000Z" }]);
});

describe("POST /api/instagram/posts", () => {
  it("publishes immediately and never touches the schedule table", async () => {
    const response = await POST(post(stagedBody));

    expect(response.status).toBe(201);
    expect(publishMock).toHaveBeenCalledWith({
      account: connection.account,
      accessToken: "page-token",
      imageUrl: stagedBody.imageUrl,
      caption: "Behind the headline",
    });
    expect(sqlMock).not.toHaveBeenCalled();
    expect(eventMock).not.toHaveBeenCalled();
    const data = (await response.json()) as { scheduledFor: string | null };
    expect(data.scheduledFor).toBeUndefined();
  });

  it("stores a scheduled row instead of publishing", async () => {
    const slot = new Date(Date.now() + 60 * 60_000);
    slot.setMilliseconds(0);

    const response = await POST(post({ ...stagedBody, scheduledFor: slot.toISOString() }));

    expect(response.status).toBe(201);
    expect(publishMock).not.toHaveBeenCalled();
    expect(sqlMock).toHaveBeenCalledTimes(1);
    const values = sqlMock.mock.calls[0].slice(1);
    expect(values).toEqual([
      "ws_1",
      "Behind the headline",
      stagedBody.imageUrl,
      slot.toISOString(),
      "u1",
    ]);
    // kind and source are literal in the INSERT — assert the SQL text.
    const queryText = (sqlMock.mock.calls[0][0] as TemplateStringsArray).join(
      " "
    );
    expect(queryText).toContain("'instagram-post'");
    expect(queryText).toContain("'local'");
    expect(eventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledPostId: 55,
        event: "scheduled",
        source: "composer",
        metadata: { kind: "instagram-post", scheduledFor: slot.toISOString() },
      })
    );
    const data = (await response.json()) as {
      id: number;
      scheduledFor: string | null;
    };
    expect(data.id).toBe(55);
    expect(data.scheduledFor).toBe(slot.toISOString());
  });

  it("rejects schedule times inside the 10-minute floor", async () => {
    const response = await POST(
      post({
        ...stagedBody,
        scheduledFor: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
    );

    expect(response.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("verifies the staged image before scheduling", async () => {
    stageMock.mockRejectedValue(new Error("not staged"));

    const response = await POST(
      post({
        ...stagedBody,
        scheduledFor: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
    );

    expect(response.status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});
