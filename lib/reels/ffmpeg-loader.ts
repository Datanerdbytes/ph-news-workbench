// The ffmpeg.wasm ESM glue is self-hosted under /public/ffmpeg and imported at
// runtime (turbopackIgnore) because Turbopack cannot statically analyze its
// dynamic `new URL(classWorkerURL, import.meta.url)` worker construction.
// Same-origin keeps the module worker legal; bundling it would break the build.
const FFMPEG_MODULE = "/ffmpeg/ffmpeg/index.js";
const UTIL_MODULE = "/ffmpeg/util/index.js";

export type FfmpegLibs = {
  FFmpeg: typeof import("@ffmpeg/ffmpeg").FFmpeg;
  toBlobURL: typeof import("@ffmpeg/util").toBlobURL;
  fetchFile: typeof import("@ffmpeg/util").fetchFile;
};

export async function loadFfmpegLibs(): Promise<FfmpegLibs> {
  const [ffmpeg, util] = (await Promise.all([
    import(/* turbopackIgnore: true */ FFMPEG_MODULE),
    import(/* turbopackIgnore: true */ UTIL_MODULE),
  ])) as [typeof import("@ffmpeg/ffmpeg"), typeof import("@ffmpeg/util")];
  return {
    FFmpeg: ffmpeg.FFmpeg,
    toBlobURL: util.toBlobURL,
    fetchFile: util.fetchFile,
  };
}