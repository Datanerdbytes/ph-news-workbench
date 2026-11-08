import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { bakeReelAnimation } from "./bake";

/**
 * bakeReelAnimation drives the browser's video + canvas + MediaRecorder
 * pipeline, so the node-env tests stub those globals and assert the contract
 * that protects real posts: native-resolution recording, no silent muting,
 * and clean failure before any recorder starts.
 */

type FakeCtx = {
  scale: Mock;
  clearRect: Mock;
  drawImage: Mock;
  save: Mock;
  restore: Mock;
  fillRect: Mock;
  measureText: Mock;
  textBaseline: string;
  textAlign: string;
  font: string;
  fillStyle: string;
  globalAlpha: number;
};

function makeCtx(): FakeCtx {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 42 })),
    textBaseline: "alphabetic",
    textAlign: "start",
    font: "",
    fillStyle: "",
    globalAlpha: 1,
  };
}

type FakeVideo = {
  src: string;
  playsInline: boolean;
  preload: string;
  muted: boolean;
  currentTime: number;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  play: Mock;
  pause: Mock;
  onended: ((event: Event) => void) | null;
  onerror: (() => void) | null;
};

let video: FakeVideo;
let canvas: {
  width: number;
  height: number;
  getContext: Mock;
  captureStream: Mock;
};
let ctx: FakeCtx;
let closes: number[];
let recorder: {
  state: string;
  start: Mock;
  stop: Mock;
  ondataavailable: ((event: { data: BlobPart }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
};
let captureStreamMock: Mock;

/**
 * Loaded-metadata resolves lazily the way a sniffed local blob does; `play`
 * may end the bake itself by firing `onended` once the loop has attached it.
 */
function installBrowserStubs(play: (video: FakeVideo) => Promise<void>) {
  video = {
    src: "",
    playsInline: false,
    preload: "",
    muted: false,
    currentTime: 0,
    duration: 5,
    videoWidth: 720,
    videoHeight: 1280,
    play: vi.fn(() => play(video)),
    pause: vi.fn(),
    onended: null,
    onerror: null,
  };
  let queued = 0;
  Object.defineProperty(video, "onloadedmetadata", {
    set(cb: (() => void) | null) {
      if (queued++ === 0) queueMicrotask(() => cb?.());
    },
  });

  ctx = makeCtx();
  captureStreamMock = vi.fn(() => ({ getTracks: () => [], addTrack: vi.fn() }));
  canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    captureStream: captureStreamMock,
  };

  let createdVideo = false;
  let createdCanvas = false;
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (!createdVideo && tag === "video") {
        createdVideo = true;
        return video;
      }
      if (!createdCanvas && tag === "canvas") {
        createdCanvas = true;
        return canvas;
      }
      return {};
    },
  });

  recorder = {
    state: "inactive",
    start: vi.fn(() => {
      recorder.state = "recording";
    }),
    stop: vi.fn(() => {
      recorder.state = "inactive";
      queueMicrotask(() => {
        recorder.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) });
        recorder.onstop?.();
      });
    }),
    ondataavailable: null,
    onstop: null,
    onerror: null,
  };
  class MediaRecorderStub {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      return recorder as unknown as MediaRecorderStub;
    }
  }
  vi.stubGlobal("MediaRecorder", MediaRecorderStub);
  vi.stubGlobal("HTMLCanvasElement", class {});
  vi.stubGlobal(
    "AudioContext",
    class AudioContextStub {
      state = "running";
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {
        closes.push(1);
      });
      destination = {};
      createMediaElementSource() {
        return { connect: vi.fn() };
      }
      createMediaStreamDestination() {
        return { stream: { getAudioTracks: () => [] }, connect: vi.fn() };
      }
      createGain() {
        return { gain: { value: 1 }, connect: vi.fn() };
      }
    }
  );

  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}

beforeEach(() => {
  closes = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bakeReelAnimation", () => {
  it("rejects unknown presets before touching the DOM", async () => {
    installBrowserStubs(() => Promise.resolve());
    await expect(
      bakeReelAnimation({ videoUrl: "blob:x", presetId: "nonexistent", values: {} })
    ).rejects.toThrow("Unknown animation preset.");
  });

  it("refuses browsers without MediaRecorder support", async () => {
    installBrowserStubs(() => Promise.resolve());
    vi.unstubAllGlobals();
    await expect(
      bakeReelAnimation({ videoUrl: "blob:x", presetId: "headline", values: {} })
    ).rejects.toThrow("This browser cannot record the animation.");
  });

  it("fails loudly when playback is blocked — never bakes a muted, silent reel", async () => {
    installBrowserStubs(async () => {
      throw new DOMException("NotAllowedError", "NotAllowedError");
    });

    await expect(
      bakeReelAnimation({ videoUrl: "blob:x", presetId: "headline", values: {} })
    ).rejects.toThrow(/Playback was blocked/);

    expect(recorder.start).not.toHaveBeenCalled();
    expect(closes.length).toBe(1);
    expect(video.muted).toBe(false);
    expect(captureStreamMock).toHaveBeenCalledWith(30);
  });

  it("records the composited reel at the reel's native 1080×1920", async () => {
    installBrowserStubs((element) => {
      setTimeout(() => element.onended?.(new Event("ended")), 0);
      return Promise.resolve();
    });

    const blob = await bakeReelAnimation({
      videoUrl: "blob:x",
      presetId: "headline",
      values: { text: "Big news today" },
    });

    expect(blob.type).toBe("video/webm");
    expect(blob.size).toBeGreaterThan(0);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
    expect(ctx.scale).toHaveBeenCalledWith(1, 1);
    expect(captureStreamMock).toHaveBeenCalledWith(30);
    expect(recorder.start).toHaveBeenCalledWith(250);
    expect(video.src).toBe("");
  });
});
