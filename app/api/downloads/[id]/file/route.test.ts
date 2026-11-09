import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, requireWorkspaceMock, findDiskDownloadMock, downloadRootMock } = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), { unsafe: (fragment: string) => fragment });
  return {
    sqlMock: sql,
    requireWorkspaceMock: vi.fn(),
    findDiskDownloadMock: vi.fn(),
    downloadRootMock: vi.fn(),
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
vi.mock("@/lib/downloads/disk-jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/downloads/disk-jobs")>()),
  findDiskDownload: findDiskDownloadMock,
  downloadRoot: downloadRootMock,
}));

import { GET } from "./route";

const access = { user: { id: "u1" }, workspace: { id: "ws1" } };
const BLOB_URL = "https://blob.public.blob.vercel-storage.com/downloads/ws1/job-1/clip.mp4";

let root: string;
let filePath: string;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(id: string, init?: RequestInit) {
  return GET(new Request(`http://localhost/api/downloads/${id}/file`, init), ctx(id));
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "downloads-file-route-"));
  filePath = path.join(root, "clip.mp4");
  await writeFile(filePath, "hello-video-bytes");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockResolvedValue(access);
  sqlMock.mockResolvedValue([]);
  downloadRootMock.mockReturnValue(root);
  findDiskDownloadMock.mockResolvedValue({
    id: "disk-abc",
    platform: "YouTube",
    filePath,
    fileName: "clip.mp4",
    createdAt: 1,
  });
});

describe("GET /api/downloads/[id]/file (cloud jobs)", () => {
  it("rejects unauthenticated requests", async () => {
    requireWorkspaceMock.mockResolvedValue(null);
    expect((await get("job-1")).status).toBe(401);
  });

  it("returns 404 for unknown jobs", async () => {
    expect((await get("nope")).status).toBe(404);
  });

  it("returns 409 until the worker has uploaded the file", async () => {
    sqlMock.mockResolvedValue([{ status: "downloading", blob_url: null }]);
    expect((await get("job-1")).status).toBe(409);
    sqlMock.mockResolvedValue([{ status: "done", blob_url: null }]);
    expect((await get("job-1")).status).toBe(409);
  });

  it("redirects to the blob for playback", async () => {
    sqlMock.mockResolvedValue([{ status: "done", blob_url: BLOB_URL }]);
    const response = await get("job-1");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(BLOB_URL);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const call = sqlMock.mock.calls[0];
    expect(call.slice(1)).toEqual(["job-1", "ws1"]);
  });

  it("forces an attachment with ?download", async () => {
    sqlMock.mockResolvedValue([{ status: "done", blob_url: BLOB_URL }]);
    const response = await GET(
      new Request("http://localhost/api/downloads/job-1/file?download=1"),
      ctx("job-1")
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BLOB_URL}?download=1`);
  });
});

describe("GET /api/downloads/[id]/file (legacy disk jobs)", () => {
  it("streams the local file inline", async () => {
    const response = await get("disk-abc");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toBe(
      "inline; filename*=UTF-8''clip.mp4"
    );
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(await response.text()).toBe("hello-video-bytes");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("serves attachment disposition with ?download", async () => {
    const response = await GET(
      new Request("http://localhost/api/downloads/disk-abc/file?download=1"),
      ctx("disk-abc")
    );
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''clip.mp4"
    );
  });

  it("honors range requests for the video element", async () => {
    const response = await get("disk-abc", { headers: { range: "bytes=0-4" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-4/17");
    expect(await response.text()).toBe("hello");
  });

  it("supports suffix ranges", async () => {
    const response = await get("disk-abc", { headers: { range: "bytes=-5" } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("bytes");
  });

  it("rejects invalid ranges", async () => {
    const response = await get("disk-abc", { headers: { range: "bytes=99-" } });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */17");
  });

  it("returns 404 for unknown disk ids", async () => {
    findDiskDownloadMock.mockResolvedValue(null);
    expect((await get("disk-gone")).status).toBe(404);
  });

  it("refuses paths outside the download root", async () => {
    findDiskDownloadMock.mockResolvedValue({
      id: "disk-evil",
      platform: "YouTube",
      filePath: "/etc/passwd",
      fileName: "passwd",
      createdAt: 1,
    });
    expect((await get("disk-evil")).status).toBe(404);
  });

  it("returns 410 when the file vanished from disk", async () => {
    findDiskDownloadMock.mockResolvedValue({
      id: "disk-missing",
      platform: "YouTube",
      filePath: path.join(root, "missing.mp4"),
      fileName: "missing.mp4",
      createdAt: 1,
    });
    expect((await get("disk-missing")).status).toBe(410);
  });
});