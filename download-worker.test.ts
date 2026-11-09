import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blobFileName,
  buildYtdlpArgs,
  contentTypeFor,
  downloadRoot,
  parseOutputLine,
  pythonExecutable,
  QUALITY_FORMATS,
} from "./download-worker";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pythonExecutable", () => {
  it("honors YTDLP_PYTHON", () => {
    vi.stubEnv("YTDLP_PYTHON", "/custom/python");
    expect(pythonExecutable()).toBe("/custom/python");
  });

  it("falls back to the YT_DLP venv", () => {
    vi.stubEnv("YTDLP_PYTHON", "");
    expect(pythonExecutable()).toContain(path.join("YT_DLP", "my_venv"));
  });
});

describe("downloadRoot", () => {
  it("honors VIDEO_DOWNLOADER_ROOT", () => {
    vi.stubEnv("VIDEO_DOWNLOADER_ROOT", "/tmp/videos");
    expect(downloadRoot()).toBe("/tmp/videos");
  });

  it("defaults to ~/Downloads/VideoDownloader", () => {
    vi.stubEnv("VIDEO_DOWNLOADER_ROOT", "");
    expect(downloadRoot()).toBe(path.join(process.env.HOME ?? "", "Downloads", "VideoDownloader"));
  });
});

describe("buildYtdlpArgs", () => {
  it("builds the mp4 merge command with a per-job output template", () => {
    const args = buildYtdlpArgs(QUALITY_FORMATS["720"], "/dl/YouTube/job-1", "https://youtu.be/abc");
    expect(args.slice(0, 2)).toEqual(["-m", "yt_dlp"]);
    expect(args).toContain("--no-playlist");
    expect(args).toContain("--newline");
    expect(args[args.indexOf("--format") + 1]).toBe(QUALITY_FORMATS["720"]);
    expect(args[args.indexOf("--merge-output-format") + 1]).toBe("mp4");
    expect(args[args.indexOf("--output") + 1]).toBe(
      path.join("/dl/YouTube/job-1", "%(title).180B [%(id)s].%(ext)s")
    );
    expect(args[args.indexOf("--print") + 1]).toBe("after_move:filepath");
    expect(args.at(-1)).toBe("https://youtu.be/abc");
  });

  it("has a format for every supported quality", () => {
    expect(Object.keys(QUALITY_FORMATS).sort()).toEqual(["1080", "480", "720", "best"]);
  });
});

describe("contentTypeFor", () => {
  it("maps video extensions", () => {
    expect(contentTypeFor("clip.mp4")).toBe("video/mp4");
    expect(contentTypeFor("clip.WEBM")).toBe("video/webm");
    expect(contentTypeFor("clip.mkv")).toBe("video/x-matroska");
    expect(contentTypeFor("clip.mov")).toBe("video/quicktime");
    expect(contentTypeFor("clip.unknown")).toBe("video/mp4");
  });
});

describe("blobFileName", () => {
  it("strips characters Vercel Blob would percent-encode in the download name", () => {
    expect(blobFileName("Me at the zoo [jNQXAC9IVRw].mp4")).toBe(
      "Me_at_the_zoo_jNQXAC9IVRw.mp4"
    );
    expect(blobFileName("clip.mp4")).toBe("clip.mp4");
    expect(blobFileName("a  b??c.webm")).toBe("a_b_c.webm");
  });
});

describe("parseOutputLine", () => {
  const dir = path.resolve("/dl/YouTube/job-1");

  it("maps yt-dlp phases to status messages", () => {
    expect(parseOutputLine("[youtube] Extracting URL: https://youtu.be/abc", "YouTube", dir).statusMessage)
      .toBe("Opening video link…");
    expect(parseOutputLine("[youtube] Downloading webpage", "YouTube", dir).statusMessage)
      .toBe("Connecting to YouTube…");
    expect(parseOutputLine("[info] Downloading format JSON metadata", "YouTube", dir).statusMessage)
      .toBe("Checking video details…");
    expect(parseOutputLine("[info] Downloading m3u8 manifest", "YouTube", dir).statusMessage)
      .toBe("Preparing video streams…");
    expect(parseOutputLine("[download] Destination: /dl/YouTube/job-1/clip.mp4", "YouTube", dir))
      .toMatchObject({ status: "downloading", statusMessage: "Preparing video file…" });
    expect(parseOutputLine("[Merger] Merging formats into clip.mp4", "YouTube", dir))
      .toMatchObject({ status: "finalizing", statusMessage: "Finishing video…" });
  });

  it("extracts and clamps progress", () => {
    expect(parseOutputLine("[download]  42.5% of 10MiB", "YouTube", dir)).toMatchObject({
      status: "downloading",
      progress: 42.5,
      statusMessage: "Downloading video…",
    });
    expect(parseOutputLine("[download] 150% done", "YouTube", dir).progress).toBe(100);
  });

  it("captures the final file path only inside the job directory", () => {
    const inside = path.join(dir, "clip.mp4");
    expect(parseOutputLine(inside, "YouTube", dir).filePath).toBe(inside);
    expect(parseOutputLine("/etc/passwd", "YouTube", dir).filePath).toBeUndefined();
    expect(parseOutputLine("relative/path.mp4", "YouTube", dir).filePath).toBeUndefined();
  });

  it("ignores empty lines", () => {
    expect(parseOutputLine("", "YouTube", dir)).toEqual({});
  });
});