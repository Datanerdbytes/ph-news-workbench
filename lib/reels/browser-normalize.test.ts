// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ffmpegState = vi.hoisted(() => ({
  instances: [] as Array<{
    handlers: Record<string, Array<(e: unknown) => void>>;
    lastArgs?: string[];
    terminated?: boolean;
  }>,
  execCode: 0,
  output: new Uint8Array([1, 2, 3]),
  loadCalls: [] as Array<{ coreURL?: string; wasmURL?: string }>,
}));

vi.mock("./ffmpeg-loader", () => ({
  loadFfmpegLibs: () =>
    Promise.resolve({
      FFmpeg: class {
        handlers: Record<string, Array<(e: unknown) => void>> = {};
        lastArgs?: string[];
        terminated?: boolean;
        constructor() {
          ffmpegState.instances.push(this);
        }
        on(event: string, cb: (e: unknown) => void) {
          (this.handlers[event] ??= []).push(cb);
        }
        off() {}
        load(config: { coreURL?: string; wasmURL?: string }) {
          ffmpegState.loadCalls.push(config);
          return Promise.resolve(true);
        }
        exec(args: string[]) {
          this.lastArgs = args;
          return Promise.resolve(ffmpegState.execCode);
        }
        writeFile() {
          return Promise.resolve(true);
        }
        readFile() {
          return Promise.resolve(ffmpegState.output);
        }
        terminate() {
          this.terminated = true;
        }
      },
      toBlobURL: (url: string) => Promise.resolve(`blob:${url}`),
      fetchFile: () => Promise.resolve(new Uint8Array([9, 9, 9])),
    }),
}));

import {
  buildBakeRemuxArgs,
  buildBrowserTranscodeArgs,
  canBrowserPlay,
  finalizeBakedVideo,
  normalizeVideo,
} from "./browser-normalize";

function stubVideo(playable: boolean) {
  const fake = {
    muted: false,
    src: "",
    onloadeddata: null as null | (() => void),
    onerror: null as null | (() => void),
    load() {
      queueMicrotask(() => {
        if (playable) fake.onloadeddata?.();
        else fake.onerror?.();
      });
    },
    removeAttribute() {},
  };
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "video" ? fake : original(tag)) as typeof document.createElement);
  return fake;
}

function response(status: number, body?: { error?: string }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: () => Promise.resolve(new Blob(["normalized"], { type: "video/mp4" })),
    json: () => Promise.resolve(body ?? {}),
  };
}

beforeEach(() => {
  ffmpegState.instances.length = 0;
  ffmpegState.loadCalls.length = 0;
  ffmpegState.execCode = 0;
  ffmpegState.output = new Uint8Array([1, 2, 3]);
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildBrowserTranscodeArgs", () => {
  it("targets H.264/AAC 1080x1920 faststart like the server transcode", () => {
    const args = buildBrowserTranscodeArgs("input.mov", "output.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("+faststart");
    expect(args).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("input.mov");
    expect(args[args.length - 1]).toBe("output.mp4");
  });
});

describe("buildBakeRemuxArgs", () => {
  it("copies the bake losslessly into a progressive faststart MP4", () => {
    const args = buildBakeRemuxArgs("input.mp4", "output.mp4");
    expect(args).toEqual(["-i", "input.mp4", "-c", "copy", "-movflags", "+faststart", "output.mp4"]);
    expect(args).not.toContain("libx264");
  });
});

describe("finalizeBakedVideo", () => {
  it("remuxes MP4 bakes losslessly — no re-encode", async () => {
    const out = await finalizeBakedVideo(new Blob(["fmp4"], { type: "video/mp4" }));
    expect(out.name).toBe("baked-reel.mp4");
    expect(out.type).toBe("video/mp4");
    const instance = ffmpegState.instances[0];
    expect(instance.lastArgs).toContain("-c");
    expect(instance.lastArgs).toContain("copy");
    expect(instance.lastArgs).not.toContain("libx264");
    expect(instance.terminated).toBe(true);
  });

  it("transcodes WebM bakes to H.264", async () => {
    const out = await finalizeBakedVideo(new Blob(["webm"], { type: "video/webm" }));
    expect(out.name).toBe("baked-reel.mp4");
    expect(out.type).toBe("video/mp4");
    const instance = ffmpegState.instances[0];
    expect(instance.lastArgs).toContain("libx264");
    expect(instance.terminated).toBe(true);
  });

  it("treats an untagged bake as WebM and transcodes it", async () => {
    await finalizeBakedVideo(new Blob(["x"], { type: "" }));
    const instance = ffmpegState.instances[0];
    expect(instance.lastArgs).toContain("libx264");
  });

  it("propagates converter failures so the composer can warn", async () => {
    ffmpegState.execCode = 1;
    await expect(
      finalizeBakedVideo(new Blob(["fmp4"], { type: "video/mp4" }))
    ).rejects.toThrow("The browser video converter failed.");
    ffmpegState.execCode = 0;
  });
});

describe("canBrowserPlay", () => {
  it("resolves true when the first frame loads", async () => {
    stubVideo(true);
    await expect(canBrowserPlay(new Blob(["x"]))).resolves.toBe(true);
  });

  it("resolves false when the element errors (Safari + AV1)", async () => {
    stubVideo(false);
    await expect(canBrowserPlay(new Blob(["x"]))).resolves.toBe(false);
  });
});

describe("normalizeVideo", () => {
  it("uses the server result when prepare succeeds", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response(200)));
    vi.stubGlobal("fetch", fetchMock);
    const out = await normalizeVideo(new Blob(["raw"]), "clip.mov");
    expect(out.normalized).toBe(true);
    expect(out.error).toBeUndefined();
    expect(out.file.name).toBe("clip.mp4");
    expect(out.file.type).toBe("video/mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ffmpegState.instances).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("surfaces non-503 failures (duration validation) without transcoding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(400, { error: "too short" })))
    );
    const out = await normalizeVideo(new Blob(["raw"]), "clip.mp4");
    expect(out.normalized).toBe(false);
    expect(out.error).toBe("too short");
    expect(out.file.name).toBe("clip.mp4");
    expect(ffmpegState.instances).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("keeps a playable original silently when the server returns 503", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response(503))));
    stubVideo(true);
    const out = await normalizeVideo(new Blob(["raw"]), "clip.mp4");
    expect(out.normalized).toBe(false);
    expect(out.error).toBeUndefined();
    expect(out.file.name).toBe("clip.mp4");
    expect(ffmpegState.instances).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("transcodes in-browser when 503 and the browser cannot play it", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response(503))));
    stubVideo(false);
    const onProgress = vi.fn();
    const out = await normalizeVideo(new Blob(["raw"]), "clip.mov", onProgress);
    expect(out.normalized).toBe(true);
    expect(out.file.name).toBe("clip.mp4");
    expect(out.file.type).toBe("video/mp4");
    expect(ffmpegState.instances).toHaveLength(1);
    const instance = ffmpegState.instances[0];
    expect(instance.lastArgs).toContain("libx264");
    expect(instance.terminated).toBe(true);
    expect(ffmpegState.loadCalls[0].coreURL).toContain("/dist/esm/ffmpeg-core.js");
    instance.handlers.progress[0]({ progress: 0.5 });
    instance.handlers.progress[0]({ progress: 5 });
    expect(onProgress).toHaveBeenNthCalledWith(1, 0.5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 1);
    vi.unstubAllGlobals();
  });

  it("falls back to the original with an error when the transcode fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response(503))));
    stubVideo(false);
    ffmpegState.execCode = 1;
    const out = await normalizeVideo(new Blob(["raw"]), "clip.mov");
    expect(out.normalized).toBe(false);
    expect(out.error).toBe("The browser video converter failed.");
    expect(out.file.name).toBe("clip.mov");
    expect(ffmpegState.instances[0].terminated).toBe(true);
    vi.unstubAllGlobals();
  });
});