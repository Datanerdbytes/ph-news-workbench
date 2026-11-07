import { describe, expect, it } from "vitest";
import { downloadJobs, publicDownloadJob, type DownloadJob } from "./jobs";

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: "job-1",
    workspaceId: "ws1",
    userId: "u1",
    platform: "youtube",
    quality: "1080p",
    status: "downloading",
    progress: 42,
    statusMessage: "42%",
    filePath: null,
    error: null,
    logs: ["started"],
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("publicDownloadJob", () => {
  it("projects the fields the client may see", () => {
    expect(publicDownloadJob(job())).toEqual({
      id: "job-1",
      platform: "youtube",
      quality: "1080p",
      status: "downloading",
      progress: 42,
      statusMessage: "42%",
      fileName: null,
      saveLocation: null,
      error: null,
      createdAt: 1_700_000_000_000,
    });
  });

  it("derives the file name from either path separator", () => {
    expect(publicDownloadJob(job({ filePath: "/tmp/dl/clip.mp4" })).fileName).toBe(
      "clip.mp4"
    );
    expect(
      publicDownloadJob(job({ filePath: "C:\\Downloads\\clip.mp4" })).fileName
    ).toBe("clip.mp4");
    expect(
      publicDownloadJob(job({ filePath: "/tmp/dl" })).fileName
    ).toBe("dl");
  });
});

describe("downloadJobs store", () => {
  it("is the shared in-memory map", () => {
    expect(downloadJobs).toBeInstanceOf(Map);
    expect(downloadJobs.size).toBeGreaterThanOrEqual(0);
  });
});
