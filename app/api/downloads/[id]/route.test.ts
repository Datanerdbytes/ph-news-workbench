import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, requireWorkspaceMock, deleteStagedBlobsMock, findDiskDownloadMock } =
  vi.hoisted(() => {
    const sql = Object.assign(vi.fn(), { unsafe: (fragment: string) => fragment });
    return {
      sqlMock: sql,
      requireWorkspaceMock: vi.fn(),
      deleteStagedBlobsMock: vi.fn(),
      findDiskDownloadMock: vi.fn(),
    };
  });

vi.mock("@/lib/db", () => ({ sql: sqlMock }));
vi.mock("@/lib/blob", () => ({ deleteStagedBlobs: deleteStagedBlobsMock }));
vi.mock("@/lib/session", () => ({
  requireWorkspace: requireWorkspaceMock,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));
vi.mock("@/lib/downloads/disk-jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/downloads/disk-jobs")>()),
  findDiskDownload: findDiskDownloadMock,
}));

import { DELETE, GET } from "./route";

const access = { user: { id: "u1" }, workspace: { id: "ws1" } };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    platform: "YouTube",
    quality: "best",
    status: "done",
    progress: 100,
    status_message: "Download complete.",
    file_name: "clip.mp4",
    blob_url: "https://blob.public.blob.vercel-storage.com/downloads/ws1/job-1/clip.mp4",
    save_location: "/Users/me/Downloads/VideoDownloader/YouTube/job-1/clip.mp4",
    error: null,
    created_at_ms: 1_700_000_000_000,
    ...overrides,
  };
}

function queryText(call: unknown[]) {
  return (call[0] as string[]).join("?");
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockResolvedValue(access);
  findDiskDownloadMock.mockResolvedValue(null);
  deleteStagedBlobsMock.mockResolvedValue(undefined);
  sqlMock.mockResolvedValue([]);
});

describe("GET /api/downloads/[id]", () => {
  it("rejects unauthenticated requests", async () => {
    requireWorkspaceMock.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/downloads/job-1"), ctx("job-1"));
    expect(response.status).toBe(401);
  });

  it("returns the public cloud row scoped to the workspace", async () => {
    sqlMock.mockResolvedValue([row()]);
    const response = await GET(new Request("http://localhost/api/downloads/job-1"), ctx("job-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toMatchObject({
      id: "job-1",
      status: "done",
      source: "cloud",
      fileName: "clip.mp4",
      saveLocation: "/Users/me/Downloads/VideoDownloader/YouTube/job-1/clip.mp4",
    });
    const call = sqlMock.mock.calls[0];
    expect(queryText(call)).toContain("WHERE id =");
    expect(call.slice(2)).toEqual(["job-1", "ws1"]);
  });

  it("returns 404 for unknown jobs", async () => {
    const response = await GET(new Request("http://localhost/api/downloads/nope"), ctx("nope"));
    expect(response.status).toBe(404);
  });

  it("serves legacy disk jobs without touching the database", async () => {
    findDiskDownloadMock.mockResolvedValue({
      id: "disk-abc",
      platform: "TikTok",
      filePath: "/dl/VideoDownloader/TikTok/x/clip.mp4",
      fileName: "clip.mp4",
      createdAt: 5,
    });
    const response = await GET(
      new Request("http://localhost/api/downloads/disk-abc"),
      ctx("disk-abc")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toMatchObject({ id: "disk-abc", source: "disk", status: "done" });
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns 404 for missing disk jobs", async () => {
    const response = await GET(
      new Request("http://localhost/api/downloads/disk-gone"),
      ctx("disk-gone")
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/downloads/[id]", () => {
  function del(id: string) {
    return DELETE(new Request(`http://localhost/api/downloads/${id}`, { method: "DELETE" }), ctx(id));
  }

  it("rejects unauthenticated requests", async () => {
    requireWorkspaceMock.mockResolvedValue(null);
    expect((await del("job-1")).status).toBe(401);
  });

  it("returns 404 for unknown jobs", async () => {
    expect((await del("nope")).status).toBe(404);
    expect(deleteStagedBlobsMock).not.toHaveBeenCalled();
  });

  it("refuses to remove active jobs", async () => {
    for (const status of ["queued", "fetching", "downloading", "finalizing"]) {
      sqlMock.mockResolvedValue([{ status, blob_url: null }]);
      const response = await del("job-1");
      expect(response.status).toBe(409);
    }
    expect(deleteStagedBlobsMock).not.toHaveBeenCalled();
  });

  it("deletes finished jobs and cleans up the staged blob", async () => {
    const finished = row();
    sqlMock.mockImplementation(async (...args: unknown[]) =>
      queryText(args).includes("DELETE FROM") ? [] : [{ status: finished.status, blob_url: finished.blob_url }]
    );
    const response = await del("job-1");
    expect(response.status).toBe(204);
    expect(deleteStagedBlobsMock).toHaveBeenCalledWith([finished.blob_url]);
    const deleteCall = sqlMock.mock.calls.find((call) => queryText(call).includes("DELETE FROM"));
    expect(deleteCall!.slice(1)).toEqual(["job-1", "ws1"]);
  });

  it("deletes failed jobs without a blob", async () => {
    sqlMock.mockImplementation(async (...args: unknown[]) =>
      queryText(args).includes("DELETE FROM") ? [] : [{ status: "failed", blob_url: null }]
    );
    const response = await del("job-1");
    expect(response.status).toBe(204);
    expect(deleteStagedBlobsMock).not.toHaveBeenCalled();
  });
});