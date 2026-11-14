import {
  effectLocalTime,
  getPreset,
  planEffects,
  type PlannedEffect,
  type PresetValues,
  type ReelAttachment,
} from '@/lib/reels/presets';

/**
 * Bakes the picked animation presets into reel footage, in the browser.
 *
 * The video plays through once while each frame is drawn onto a 1080×1920
 * canvas — first the cover-cropped footage (scaled by any active camera
 * preset), then each slot attachment's overlay at the current time — so what
 * gets recorded is already the composited reel. The canvas stream is recorded
 * together with the video's audio into H.264 MP4 when the browser can record
 * it (WebM otherwise); finalizeBakedVideo (browser-normalize.ts) then turns
 * the recording into the progressive MP4 the publish route needs.
 */

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const DESIGN_W = 1080;
const DESIGN_H = 1920;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    // MP4/H.264 first: the baked reel can then publish straight to Facebook.
    // A WebM bake depends on /api/reels/prepare to transcode, which answers
    // 503 on Vercel — leaving no way to turn the WebM into the MP4 the
    // publish route requires.
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Draw the current video frame cover-cropped into the design space, with an optional camera zoom. */
function drawFootage(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  zoom: number
) {
  const vw = video.videoWidth || 9;
  const vh = video.videoHeight || 16;
  const scale = Math.max(DESIGN_W / vw, DESIGN_H / vh) * zoom;
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (DESIGN_W - dw) / 2, (DESIGN_H - dh) / 2, dw, dh);
}

export type BakeOptions = {
  /** Blob URL of the (already normalized) source footage. */
  videoUrl: string;
  /** Slot attachments picked in the composer; drawn in the order given. */
  attachments: ReelAttachment[];
  /** Edited text values keyed by preset id. */
  values: Record<string, PresetValues>;
  onProgress?: (fraction: number) => void;
};

/**
 * Draws one composited frame: the footage (with every active camera zoom
 * multiplied in), then each active overlay in attachment order. Looped
 * effects repeat — effectLocalTime returns null across each gap between
 * repeats, skipping them for that frame. Exported for tests.
 */
export function composeFrame(
  ctx: CanvasRenderingContext2D,
  effects: PlannedEffect[],
  videoTime: number,
  drawFootage: (zoom: number) => void
): void {
  let zoom = 1;
  const frames: { effect: PlannedEffect; local: number }[] = [];
  for (const effect of effects) {
    const local = effectLocalTime(
      videoTime,
      effect.start,
      effect.preset.duration,
      effect.loop
    );
    if (local == null) continue;
    frames.push({ effect, local });
    if (effect.preset.scale) zoom *= effect.preset.scale(local);
  }
  drawFootage(zoom);
  for (const { effect, local } of frames) {
    if (!effect.preset.draw) continue;
    ctx.save();
    effect.preset.draw(ctx, local, effect.preset.duration, effect.values);
    ctx.restore();
  }
}

/**
 * Renders the reel with the picked animations baked in. Resolves with the
 * recorded WebM; throws when the browser cannot record (caller falls back to
 * the original footage).
 */
export async function bakeReelAnimation(options: BakeOptions): Promise<Blob> {
  const { videoUrl, attachments, values, onProgress } = options;
  // Reject a fully unknown attachment before touching the DOM; planEffects
  // re-filters after metadata once the reel duration is known.
  const usable = attachments.some((attachment) => {
    const preset = getPreset(attachment.presetId);
    return (
      preset &&
      preset.id !== 'none' &&
      (preset.draw || preset.scale) &&
      preset.slots.includes(attachment.slot)
    );
  });
  if (!usable) {
    throw new Error('Unknown animation preset.');
  }
  const mimeType = pickMimeType();
  if (!mimeType || typeof HTMLCanvasElement === 'undefined') {
    throw new Error('This browser cannot record the animation.');
  }

  const video = document.createElement('video');
  video.src = videoUrl;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not read the video.'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.scale(CANVAS_W / DESIGN_W, CANVAS_H / DESIGN_H);

  // Route the video's audio into the recording while keeping the speakers
  // silent (unmuted capture through a zero-gain monitor).
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaElementSource(video);
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(dest);
  const monitor = audioCtx.createGain();
  monitor.gain.value = 0;
  source.connect(monitor);
  monitor.connect(audioCtx.destination);
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});

  const stream = canvas.captureStream(30);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      // Tag the blob with the container we asked the recorder for — callers
      // branch on it (MP4 publishes straight, WebM needs a transcode).
      const container = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
      resolve(new Blob(chunks, { type: container }));
    };
    recorder.onerror = () => reject(new Error('Recording failed.'));
  });

  video.currentTime = 0;
  try {
    await video.play();
  } catch {
    // Playback was blocked. Do NOT retry muted: the audio track is captured
    // through the AudioContext from this element, so a muted play would bake
    // a silent reel. Fail loudly instead — the composer falls back to posting
    // the footage without the animation.
    await audioCtx.close().catch(() => {});
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(
      'Playback was blocked, so the animation bake was skipped. Try posting again — the reel still publishes without it.'
    );
  }
  recorder.start(250);

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const effects = planEffects(attachments, duration, values);

  await new Promise<void>((resolve) => {
    const fps = 30;
    const minFrameMs = 1000 / fps;
    const start = performance.now();
    let lastFrameTime = start;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      // Wall-clock time since the bake started — deterministic, independent of
      // video.currentTime read jitter (was ~20–21 fps vs the 30 fps source).
      const t = (now - start) / 1000;
      if (t >= duration) {
        cancelAnimationFrame(raf);
        resolve();
        return;
      }
      // Produce one frame per 30 fps slot, seeking the video explicitly so each
      // frame renders at a deterministic time instead of drifting with RAF.
      if (now - lastFrameTime >= minFrameMs) {
        lastFrameTime = now;
        video.currentTime = Math.min(t, duration);
        if (duration) onProgress?.(Math.min(1, video.currentTime / duration));
        ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
        composeFrame(ctx, effects, video.currentTime, (zoom) =>
          drawFootage(ctx, video, zoom)
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    video.onended = () => {
      cancelAnimationFrame(raf);
      resolve();
    };
  });

  video.pause();
  if (recorder.state !== 'inactive') recorder.stop();
  const blob = await finished;
  stream.getTracks().forEach((track) => track.stop());
  await audioCtx.close().catch(() => {});
  video.src = '';
  if (blob.size === 0) throw new Error('Recording produced no data.');
  return blob;
}
