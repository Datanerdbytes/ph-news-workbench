import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import {
  buildSafariConversionArgs,
  EMPTY_VIDEO_STREAMS,
  isSafariFriendly,
  parseVideoStreams,
  prepareSafariFriendlyRendition,
  safariFriendlyFileName,
} from "./download-worker";

type SpawnCall = { command: string; args: string[] };

function fakeChild(options: {
  stdout?: string;
  stderr?: string;
  code?: number;
  beforeClose?: () => Promise<void>;
}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  setImmediate(async () => {
    if (options.stdout) child.stdout.emit("data", Buffer.from(options.stdout));
    if (options.stderr) child.stderr.emit("data", Buffer.from(options.stderr));
    if (options.beforeClose) await options.beforeClose();
    child.emit("close", options.code ?? 0);
  });
  return child;
}

function probePayload(videoCodec: string, pixFmt: string, audioCodec?: string) {
  const streams: Record<string, unknown>[] = [
    { codec_type: "video", codec_name: videoCodec, pix_fmt: pixFmt },
  ];
  if (audioCodec) {
    streams.push({ codec_type: "audio", codec_name: audioCodec, pix_fmt: "fltp" });
  }
  return JSON.stringify({ streams });
}

describe("parseVideoStreams", () => {
  it("reads the video and audio codecs from an ffprobe payload", () => {
    expect(parseVideoStreams(probePayload("av1", "yuv420p", "aac"))).toEqual({
      videoCodec: "av1",
      pixelFormat: "yuv420p",
      audioCodec: "aac",
    });
  });

  it("reports a missing audio stream as null", () => {
    expect(parseVideoStreams(probePayload("h264", "yuv420p"))).toEqual({
      videoCodec: "h264",
      pixelFormat: "yuv420p",
      audioCodec: null,
    });
  });

  it("falls back to empty streams on unparsable output", () => {
    expect(parseVideoStreams("not json")).toEqual(EMPTY_VIDEO_STREAMS);
  });
});

describe("isSafariFriendly", () => {
  it("accepts H.264 in yuv420p with AAC or MP3 audio", () => {
    expect(
      isSafariFriendly({
        videoCodec: "h264",
        pixelFormat: "yuv420p",
        audioCodec: "aac",
      })
    ).toBe(true);
    expect(
      isSafariFriendly({
        videoCodec: "h264",
        pixelFormat: "yuv420p",
        audioCodec: "mp3",
      })
    ).toBe(true);
    expect(
      isSafariFriendly({
        videoCodec: "h264",
        pixelFormat: "yuv420p",
        audioCodec: null,
      })
    ).toBe(true);
  });

  it("rejects AV1, HEVC, other pixel formats and other audio codecs", () => {
    expect(
      isSafariFriendly({
        videoCodec: "av1",
        pixelFormat: "yuv420p",
        audioCodec: "aac",
      })
    ).toBe(false);
    expect(
      isSafariFriendly({
        videoCodec: "hevc",
        pixelFormat: "yuv420p",
        audioCodec: "aac",
      })
    ).toBe(false);
    expect(
      isSafariFriendly({
        videoCodec: "h264",
        pixelFormat: "yuv422p",
        audioCodec: "aac",
      })
    ).toBe(false);
    expect(
      isSafariFriendly({
        videoCodec: "h264",
        pixelFormat: "yuv420p",
        audioCodec: "opus",
      })
    ).toBe(false);
  });
});

describe("safariFriendlyFileName", () => {
  it("marks the converted rendition and keeps the mp4 extension", () => {
    expect(safariFriendlyFileName("Me at the zoo [jNQXAC9IVRw].mp4")).toBe(
      "Me at the zoo [jNQXAC9IVRw] (H.264).mp4"
    );
    expect(safariFriendlyFileName("clip.webm")).toBe("clip (H.264).mp4");
    expect(safariFriendlyFileName(".mp4")).toBe("video (H.264).mp4");
  });
});

describe("buildSafariConversionArgs", () => {
  it("re-encodes to H.264 yuv420p with AAC and faststart", () => {
    const args = buildSafariConversionArgs("/in/clip.mp4", "/out/clip (H.264).mp4");
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(args[args.indexOf("-profile:v") + 1]).toBe("high");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(args[args.indexOf("-vf") + 1]).toContain("force_divisible_by=2");
    expect(args[args.indexOf("-i") + 1]).toBe("/in/clip.mp4");
    expect(args.at(-1)).toBe("/out/clip (H.264).mp4");
  });
});

describe("prepareSafariFriendlyRendition", () => {
  let calls: SpawnCall[] = [];
  let dir = "";
  let source = "";

  beforeEach(async () => {
    calls = [];
    dir = await mkdtemp(path.join(os.tmpdir(), "download-worker-"));
    source = path.join(dir, "clip.mp4");
    await writeFile(source, "original");
    spawnMock.mockReset();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes an already playable file through untouched", async () => {
    spawnMock.mockImplementation((command: string, args: string[]) => {
      calls.push({ command, args });
      return fakeChild({ stdout: probePayload("h264", "yuv420p", "aac") });
    });

    const rendition = await prepareSafariFriendlyRendition(source, dir);

    expect(rendition).toEqual({
      filePath: source,
      fileName: "clip.mp4",
      converted: false,
    });
    expect(calls.map((call) => call.command)).toEqual(["ffprobe"]);
  });

  it("converts a codec Safari cannot decode and reports the new file", async () => {
    const messages: string[] = [];
    spawnMock.mockImplementation((command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === "ffprobe") {
        return fakeChild({ stdout: probePayload("av1", "yuv420p", "aac") });
      }
      const output = args.at(-1) as string;
      return fakeChild({
        beforeClose: async () => {
          await writeFile(output, "converted");
        },
      });
    });

    const rendition = await prepareSafariFriendlyRendition(source, dir, (message) =>
      messages.push(message)
    );

    expect(rendition.converted).toBe(true);
    expect(rendition.fileName).toBe("clip (H.264).mp4");
    expect(rendition.filePath).toBe(path.join(dir, "clip (H.264).mp4"));
    expect(messages).toContain("Converting to H.264 for Safari…");
    const ffmpeg = calls.find((call) => call.command === "ffmpeg");
    expect(ffmpeg?.args.at(-1)).toBe(path.join(dir, "clip (H.264).mp4"));
  });

  it("throws when the conversion fails so the caller can keep the original", async () => {
    spawnMock.mockImplementation((command: string) => {
      if (command === "ffprobe") {
        return fakeChild({ stdout: probePayload("av1", "yuv420p", "aac") });
      }
      return fakeChild({
        stderr: "Unknown encoder 'libx264'",
        code: 1,
      });
    });

    await expect(prepareSafariFriendlyRendition(source, dir)).rejects.toThrow(
      /Could not convert the video to H\.264/
    );
  });
});
