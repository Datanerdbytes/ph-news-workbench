import { mkdir, mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  discoverDiskDownloads,
  findDiskDownload,
  publicDiskDownload,
  videoContentType,
} from "./disk-jobs";

let root: string;

beforeAll(async () => {
  root = path.join(await mkdtemp(path.join(tmpdir(), "disk-jobs-")), "VideoDownloader");
  await mkdir(path.join(root, "YouTube", "job-old"), { recursive: true });
  await mkdir(path.join(root, "Facebook", "job-new"), { recursive: true });
  await mkdir(path.join(root, "TikTok", "empty"), { recursive: true });
  await writeFile(
    path.join(root, "YouTube", "job-old", "old video.mp4"),
    "old-video-bytes"
  );
  await writeFile(
    path.join(root, "Facebook", "job-new", "clip.webm"),
    "new-video-bytes"
  );
  // Stray content that must never surface as a job.
  await writeFile(path.join(root, ".DS_Store"), "junk");
  await writeFile(path.join(root, "Facebook", "job-new", "poster.txt"), "not a video");
  await writeFile(path.join(root, "Facebook", "root-video.mp4"), "file at platform level");
  await writeFile(path.join(root, "YouTube", "job-old", "corrupt.mkv"), "y");
  await rm(path.join(root, "YouTube", "job-old", "corrupt.mkv"));

  const oldTime = new Date("2025-12-01");
  const newTime = new Date("2026-01-15");
  await utimes(path.join(root, "YouTube", "job-old", "old video.mp4"), oldTime, oldTime);
  await utimes(path.join(root, "Facebook", "job-new", "clip.webm"), newTime, newTime);
});

afterAll(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

describe("discoverDiskDownloads", () => {
  it("recovers video files per platform, newest first", async () => {
    const files = await discoverDiskDownloads(root);
    expect(files.map((file) => file.fileName)).toEqual(["clip.webm", "old video.mp4"]);
    expect(files[0].platform).toBe("Facebook");
    expect(files[1].platform).toBe("YouTube");
  });

  it("ignores platform-level files, non-videos, and empty platform folders", async () => {
    const files = await discoverDiskDownloads(root);
    expect(files).toHaveLength(2);
    expect(
      files.some(
        (file) => file.filePath.includes("root-video") || file.fileName.includes("poster")
      )
    ).toBe(false);
  });

  it("returns nothing when the folder does not exist", async () => {
    expect(await discoverDiskDownloads(path.join(root, "missing-dir"))).toEqual([]);
  });
});

describe("diskJobId / findDiskDownload", () => {
  it("derives stable, per-file ids prefixed with disk-", async () => {
    const files = await discoverDiskDownloads(root);
    const [first, second] = files;
    expect(second.id).toMatch(/^disk-[0-9a-f]{24}$/);
    expect((await discoverDiskDownloads(root))[1].id).toBe(second.id);
    expect(first.id).not.toBe(second.id);

    const found = await findDiskDownload(second.id, root);
    expect(found?.fileName).toBe("old video.mp4");
    expect(await findDiskDownload("disk-unknown", root)).toBeNull();
    expect(await findDiskDownload("job-uuid-from-session", root)).toBeNull();
  });
});

describe("publicDiskDownload", () => {
  it("shapes a finished job ready for the preview panel", async () => {
    const [file] = await discoverDiskDownloads(root);
    const projected = publicDiskDownload(file);
    expect(projected).toMatchObject({
      id: file.id,
      platform: "Facebook",
      status: "done",
      progress: null,
      fileName: "clip.webm",
      saveLocation: file.filePath,
      error: null,
      source: "disk",
    });
    expect(projected.quality).toBe("");
  });
});

describe("videoContentType", () => {
  it("maps extensions to media types", () => {
    expect(videoContentType("clip.mp4")).toBe("video/mp4");
    expect(videoContentType("clip.webm")).toBe("video/webm");
    expect(videoContentType("clip.WEBM")).toBe("video/webm");
    expect(videoContentType("clip.mkv")).toBe("video/x-matroska");
    expect(videoContentType("clip.mov")).toBe("video/quicktime");
    expect(videoContentType("clip.unk")).toBe("video/mp4");
  });
});
