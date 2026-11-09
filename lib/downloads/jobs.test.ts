import { describe, expect, it } from "vitest";
import {
  ACTIVE_DOWNLOAD_STATUSES,
  publicDownloadRow,
  type DownloadJobRow,
} from "./jobs";

function row(overrides: Partial<DownloadJobRow> = {}): DownloadJobRow {
  return {
    id: "job-1",
    platform: "YouTube",
    quality: "1080",
    status: "downloading",
    progress: 42,
    status_message: "Downloading video…",
    file_name: null,
    blob_url: null,
    save_location: null,
    error: null,
    created_at_ms: 1_700_000_000_000,
    ...overrides,
  };
}

describe("publicDownloadRow", () => {
  it("projects the fields the client may see", () => {
    expect(publicDownloadRow(row())).toEqual({
      id: "job-1",
      platform: "YouTube",
      quality: "1080",
      status: "downloading",
      progress: 42,
      statusMessage: "Downloading video…",
      fileName: null,
      saveLocation: null,
      source: "cloud",
      error: null,
      createdAt: 1_700_000_000_000,
    });
  });

  it("keeps the worker's local save path when present", () => {
    const projected = publicDownloadRow(
      row({
        status: "done",
        file_name: "clip.mp4",
        save_location: "/Users/me/Downloads/VideoDownloader/YouTube/job-1/clip.mp4",
        blob_url: "https://store.public.blob.vercel-storage.com/downloads/clip.mp4",
      })
    );
    expect(projected.fileName).toBe("clip.mp4");
    expect(projected.saveLocation).toBe(
      "/Users/me/Downloads/VideoDownloader/YouTube/job-1/clip.mp4"
    );
  });

  it("falls back to the cloud library when only the blob copy exists", () => {
    const projected = publicDownloadRow(
      row({
        status: "done",
        blob_url: "https://store.public.blob.vercel-storage.com/downloads/clip.mp4",
      })
    );
    expect(projected.saveLocation).toBe("Cloud library");
  });
});

describe("ACTIVE_DOWNLOAD_STATUSES", () => {
  it("covers every non-terminal state", () => {
    expect(ACTIVE_DOWNLOAD_STATUSES).toEqual([
      "queued",
      "fetching",
      "downloading",
      "finalizing",
    ]);
  });
});