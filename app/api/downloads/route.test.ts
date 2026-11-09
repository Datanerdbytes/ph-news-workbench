import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, requireWorkspaceMock, discoverDiskDownloadsMock } = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), { unsafe: (fragment: string) => fragment });
  return {
    sqlMock: sql,
    requireWorkspaceMock: vi.fn(),
    discoverDiskDownloadsMock: vi.fn(),
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
  discoverDiskDownloads: discoverDiskDownloadsMock,
}));

import { GET, POST } from "./route";

const access = { user: { id: "u1" }, workspace: { id: "ws1" } };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    platform: "YouTube",
    quality: "best",
    status: "queued",
    progress: null,
    status_message: "Waiting for the local downloader…",
    file_name: null,
    blob_url: null,
    save_location: null,
    error: null,
    created_at_ms: 1_700_000_000_000,
    ...overrides,
  };
}

function queryText(call: unknown[]) {
  return (call[0] as string[]).join("?");
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockResolvedValue(access);
  discoverDiskDownloadsMock.mockResolvedValue([]);
  sqlMock.mockImplementation(async (...args: unknown[]) => {
    const text = queryText(args);
    if (text.includes("count(*)")) return [{ active: 0 }];
    if (text.includes("INSERT INTO download_jobs")) {
      return [row({ platform: args[4], quality: args[6] })];
    }
    return [];
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/downloads", () => {
  it("rejects unauthenticated requests", async () => {
    requireWorkspaceMock.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/downloads"));
    expect(response.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("lists the workspace's cloud jobs, newest first", async () => {
    sqlMock.mockResolvedValue([
      row({ id: "new", status: "done", blob_url: "https://blob/public/new.mp4", file_name: "new.mp4" }),
      row({ id: "old" }),
    ]);
    const response = await GET(new Request("http://localhost/api/downloads"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobs.map((job: { id: string }) => job.id)).toEqual(["new", "old"]);
    expect(body.jobs[0]).toMatchObject({
      source: "cloud",
      saveLocation: "Cloud library",
      fileName: "new.mp4",
    });
    const text = queryText(sqlMock.mock.calls[0]);
    expect(text).toContain("WHERE workspace_id =");
    expect(sqlMock.mock.calls[0][2]).toBe("ws1");
  });

  it("merges local disk jobs only in development, deduped by save location", async () => {
    vi.stubEnv("NODE_ENV", "development");
    sqlMock.mockResolvedValue([
      row({ id: "cloud", save_location: "/dl/VideoDownloader/YouTube/a/clip.mp4" }),
    ]);
    discoverDiskDownloadsMock.mockResolvedValue([
      {
        id: "disk-1",
        platform: "YouTube",
        filePath: "/dl/VideoDownloader/YouTube/a/clip.mp4",
        fileName: "clip.mp4",
        createdAt: 1,
      },
      {
        id: "disk-2",
        platform: "TikTok",
        filePath: "/dl/VideoDownloader/TikTok/b/other.mp4",
        fileName: "other.mp4",
        createdAt: 1_700_000_000_001,
      },
    ]);
    const response = await GET(new Request("http://localhost/api/downloads"));
    const body = await response.json();
    expect(body.jobs).toHaveLength(2);
    expect(body.jobs.map((job: { id: string }) => job.id)).toEqual(["disk-2", "cloud"]);
    expect(body.jobs[0].source).toBe("disk");
  });

  it("does not scan the local disk outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await GET(new Request("http://localhost/api/downloads"));
    expect(discoverDiskDownloadsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/downloads", () => {
  function post(body: unknown) {
    return POST(
      new Request("http://localhost/api/downloads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("rejects unauthenticated requests", async () => {
    requireWorkspaceMock.mockResolvedValue(null);
    const response = await post({ url: "https://youtube.com/watch?v=abc" });
    expect(response.status).toBe(401);
  });

  it("rejects unsupported or malformed URLs", async () => {
    for (const url of [
      "https://example.com/video",
      "ftp://youtube.com/watch?v=abc",
      "https://user:pass@youtube.com/watch?v=abc",
      "not a url",
      null,
    ]) {
      const response = await post({ url });
      expect(response.status).toBe(400);
    }
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported qualities", async () => {
    const response = await post({ url: "https://youtube.com/watch?v=abc", quality: "4k" });
    expect(response.status).toBe(400);
  });

  it("returns 429 when two jobs are already active", async () => {
    sqlMock.mockImplementation(async (...args: unknown[]) => {
      if (queryText(args).includes("count(*)")) return [{ active: 2 }];
      return [row()];
    });
    const response = await post({ url: "https://youtube.com/watch?v=abc" });
    expect(response.status).toBe(429);
  });

  it("queues a job in the shared database and returns the public row", async () => {
    const response = await post({
      url: "https://www.youtube.com/watch?v=abc",
      quality: "720",
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.job).toMatchObject({
      platform: "YouTube",
      quality: "720",
      status: "queued",
      source: "cloud",
    });
    const insertCall = sqlMock.mock.calls.find((call) =>
      queryText(call).includes("INSERT INTO download_jobs")
    );
    expect(insertCall).toBeDefined();
    const values = insertCall!.slice(1);
    expect(values).toContain("ws1");
    expect(values).toContain("u1");
    expect(values).toContain("YouTube");
    expect(values).toContain("720");
    expect(values).toContain("https://www.youtube.com/watch?v=abc");
    expect(queryText(insertCall!)).toContain("'queued'");
  });

  it("accepts every supported platform host", async () => {
    const urls = [
      ["https://youtu.be/abc", "YouTube"],
      ["https://fb.watch/abc", "Facebook"],
      ["https://instagram.com/reel/abc", "Instagram"],
      ["https://x.com/user/status/1", "X"],
      ["https://v.redd.it/abc", "Reddit"],
      ["https://vm.tiktok.com/abc", "TikTok"],
    ] as const;
    for (const [url, platform] of urls) {
      const response = await post({ url });
      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body.job.platform).toBe(platform);
    }
  });
});