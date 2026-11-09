import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression for the original bug: "I cannot download videos on the live app,
// looks like it's setup only for running locally." The routes used to bail with
// `503 Video downloads are available only in the local development app.` whenever
// NODE_ENV !== "development". These tests drive the real handlers in production
// mode so that guard (or any local-only regression) turns this suite red.

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
import { GET as GETFile } from "./[id]/file/route";

const access = { user: { id: "u1" }, workspace: { id: "ws1" } };
const BLOB_URL =
  "https://blob.public.blob.vercel-storage.com/downloads/ws1/job-1/Me_at_the_zoo.mp4";

function doneRow() {
  return {
    id: "job-1",
    platform: "YouTube",
    quality: "480",
    status: "done",
    progress: 100,
    status_message: "Download complete.",
    file_name: "Me at the zoo [jNQXAC9IVRw].mp4",
    blob_url: BLOB_URL,
    save_location: "/Users/me/Downloads/VideoDownloader/YouTube/job-1/clip.mp4",
    error: null,
    created_at_ms: 1_700_000_000_000,
  };
}

function queuedRow() {
  return { ...doneRow(), status: "queued", progress: null, file_name: null, blob_url: null, save_location: null, status_message: "Waiting for the local downloader…" };
}

function queryText(call: unknown[]) {
  return (call[0] as string[]).join("?");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  requireWorkspaceMock.mockResolvedValue(access);
  discoverDiskDownloadsMock.mockResolvedValue([]);
  sqlMock.mockImplementation(async (...args: unknown[]) => {
    const text = queryText(args);
    if (text.includes("count(*)")) return [{ active: 0 }];
    if (text.includes("INSERT INTO download_jobs")) return [queuedRow()];
    if (text.includes("SELECT status, blob_url")) {
      return [{ status: "done", blob_url: BLOB_URL }];
    }
    return [doneRow()];
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("regression: downloads work on the deployed (production) app", () => {
  it("POST queues a job in production instead of returning the local-only 503", async () => {
    const response = await POST(
      new Request("https://ph-news-workbench.vercel.app/api/downloads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://youtu.be/jNQXAC9IVRw", quality: "480" }),
      })
    );
    expect(response.status).not.toBe(503);
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.error).toBeUndefined();
    expect(body.job).toMatchObject({ status: "queued", source: "cloud", platform: "YouTube" });
    expect(sqlMock.mock.calls.some((call) => queryText(call).includes("INSERT INTO download_jobs"))).toBe(true);
  });

  it("GET lists cloud jobs in production and never scans the local disk", async () => {
    const response = await GET(new Request("https://ph-news-workbench.vercel.app/api/downloads"));
    expect(response.status).not.toBe(503);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobs[0]).toMatchObject({ id: "job-1", source: "cloud", status: "done" });
    expect(discoverDiskDownloadsMock).not.toHaveBeenCalled();
  });

  it("serves the finished file from Blob in production (no local-only 503)", async () => {
    const response = await GETFile(
      new Request("https://ph-news-workbench.vercel.app/api/downloads/job-1/file"),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    expect(response.status).not.toBe(503);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(BLOB_URL);
  });
});

describe("regression: Blob attachment download", () => {
  it("forces an attachment with ?download=1 (bare ?download stays inline on Vercel Blob)", async () => {
    const response = await GETFile(
      new Request("https://ph-news-workbench.vercel.app/api/downloads/job-1/file?download=1"),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toBe(`${BLOB_URL}?download=1`);
    expect(location).not.toBe(`${BLOB_URL}?download`);
  });
});