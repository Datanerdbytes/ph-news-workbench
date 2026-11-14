import { loadFfmpegLibs } from "./ffmpeg-loader";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

/**
 * Mirror of the server transcode (H.264/AAC 1080×1920 faststart) but with a
 * faster x264 preset: the wasm encoder is single-threaded and CPU-bound, so
 * `medium` would take minutes on a phone-length clip.
 */
export function buildBrowserTranscodeArgs(
  inputName: string,
  outputName: string
): string[] {
  return [
    "-i",
    inputName,
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputName,
  ];
}

/**
 * Probe whether this browser can actually decode the blob by loading its first
 * frame in a detached video element. Safari reports AV1/HEVC as an error here,
 * which is exactly the case that needs the in-browser transcode.
 */
export function canBrowserPlay(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    const timer = setTimeout(() => done(false), 8000);
    const cleanup = () => {
      clearTimeout(timer);
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    const done = (ok: boolean) => {
      cleanup();
      resolve(ok);
    };
    video.onloadeddata = () => done(true);
    video.onerror = () => done(false);
    video.src = url;
    video.load();
  });
}

/** Lossless remux of an already-encoded MP4 into a progressive (faststart)
 * MP4, `-c copy` — no re-encode, so it takes seconds. MediaRecorder emits
 * fragmented MP4 (duration lives in the fragments, mvhd reads 0, which the
 * publish route rejects); the remux produces the plain progressive file both
 * the duration check and Facebook expect. */
export function buildBakeRemuxArgs(
  inputName: string,
  outputName: string
): string[] {
  return ["-i", inputName, "-c", "copy", "-movflags", "+faststart", outputName];
}

async function runFfmpegInBrowser(
  blob: Blob,
  name: string,
  buildArgs: (inputName: string, outputName: string) => string[],
  onProgress?: (ratio: number) => void
): Promise<File> {
  // The loader's dynamic imports can stall on a bad network just like the
  // CDN fetches below — bound them so the composer's fallback still runs.
  const { FFmpeg, toBlobURL, fetchFile } = await withTimeout(
    loadFfmpegLibs(),
    60_000,
    "Loading the video converter libraries"
  );
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  });
  const inputName = `input${name.match(/\.[A-Za-z0-9]+$/)?.[0] ?? ".mp4"}`;
  const outputName = "output.mp4";
  try {
    // The wasm core comes from a CDN and runs in a worker; either can stall on
    // a bad network or an unsupported browser. Bound every stage so a failure
    // falls back to the original instead of hanging the composer.
    const [coreURL, wasmURL] = await withTimeout(
      Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      ]),
      60_000,
      "Downloading the video converter"
    );
    await withTimeout(
      ffmpeg.load({ coreURL, wasmURL }),
      60_000,
      "Loading the video converter"
    );
    await ffmpeg.writeFile(inputName, await fetchFile(blob));
    const code = await withTimeout(
      ffmpeg.exec(buildArgs(inputName, outputName)),
      180_000,
      "Converting the video"
    );
    if (code !== 0) throw new Error("The browser video converter failed.");
    const data = await ffmpeg.readFile(outputName);
    if (!(data instanceof Uint8Array) || data.length === 0) {
      throw new Error("The browser video converter produced no output.");
    }
    const base = name.replace(/\.[^.]+$/, "");
    return new File([new Uint8Array(data)], `${base}.mp4`, { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
  }
}

function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    task,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
    }),
  ]);
}

/**
 * Transcode to H.264 in the browser with ffmpeg.wasm (single-thread core, no
 * cross-origin isolation needed). Used only when server normalization is
 * unavailable and the browser cannot play the original.
 */
export async function transcodeInBrowser(
  blob: Blob,
  name: string,
  onProgress?: (ratio: number) => void
): Promise<File> {
  return runFfmpegInBrowser(blob, name, buildBrowserTranscodeArgs, onProgress);
}

/**
 * Turns a bake recording (lib/reels/bake.ts) into the publishable file, fully
 * in the browser: MP4 bakes remux losslessly to progressive faststart MP4
 * (seconds), WebM bakes transcode to H.264 (slower). Runs without the server
 * so baked animations survive where /api/reels/prepare does not — Vercel has
 * no ffmpeg, and the old flow silently dropped the bake there.
 */
export async function finalizeBakedVideo(
  blob: Blob,
  onProgress?: (ratio: number) => void
): Promise<File> {
  const isMp4 = blob.type.includes("mp4");
  return runFfmpegInBrowser(
    blob,
    isMp4 ? "baked-reel.mp4" : "baked-reel.webm",
    isMp4 ? buildBakeRemuxArgs : buildBrowserTranscodeArgs,
    onProgress
  );
}

/**
 * Server-first normalization with a browser fallback. On runtimes without
 * ffmpeg (Vercel) the prepare route answers 503; there we keep the original
 * when the browser can already play it, and transcode in-browser otherwise.
 * Non-503 failures (e.g. duration validation) still surface as errors.
 */
export async function normalizeVideo(
  blob: Blob,
  name: string,
  onProgress?: (ratio: number) => void
): Promise<{ file: File; normalized: boolean; error?: string }> {
  const original = () =>
    new File([blob], name, { type: blob.type || "video/mp4" });
  const form = new FormData();
  form.append("video", blob, name);
  const res = await fetch("/api/reels/prepare", { method: "POST", body: form });
  if (res.ok) {
    const out = await res.blob();
    const base = name.replace(/\.[^.]+$/, "");
    return {
      file: new File([out], `${base}.mp4`, { type: "video/mp4" }),
      normalized: true,
    };
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (res.status !== 503) {
    return {
      file: original(),
      normalized: false,
      error: data?.error ?? "The video could not be normalized.",
    };
  }
  if (await canBrowserPlay(blob)) {
    return { file: original(), normalized: false };
  }
  try {
    return { file: await transcodeInBrowser(blob, name, onProgress), normalized: true };
  } catch (error) {
    return {
      file: original(),
      normalized: false,
      error:
        error instanceof Error
          ? error.message
          : "The video could not be normalized in this browser.",
    };
  }
}