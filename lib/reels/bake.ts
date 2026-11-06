import { getPreset, presetStart, type PresetValues } from '@/lib/reels/presets';

/**
 * Bakes a pre-built animation preset into reel footage, in the browser.
 *
 * The video plays through once while each frame is drawn onto a 720×1280
 * canvas (9:16, upscaled to 1080×1920 by the normalizer afterwards): first the
 * cover-cropped footage, then the preset's overlay at the current time. The
 * canvas stream is recorded together with the video's audio into a WebM, which
 * /api/reels/prepare transcodes to H.264 MP4.
 */

const CANVAS_W = 720;
const CANVAS_H = 1280;
const DESIGN_W = 1080;
const DESIGN_H = 1920;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
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
  presetId: string;
  values: PresetValues;
  onProgress?: (fraction: number) => void;
};

/**
 * Renders the reel with the preset baked in. Resolves with the recorded WebM;
 * throws when the browser cannot record (caller falls back to the original
 * footage).
 */
export async function bakeReelAnimation(options: BakeOptions): Promise<Blob> {
  const { videoUrl, presetId, values, onProgress } = options;
  const preset = getPreset(presetId);
  if (!preset || (!preset.draw && !preset.scale)) {
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
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.onerror = () => reject(new Error('Recording failed.'));
  });

  video.currentTime = 0;
  await video.play().catch(() => {
    // Transient activation may have expired — retry muted (silent bake).
    video.muted = true;
    return video.play();
  });
  recorder.start(250);

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const effectStart = presetStart(preset, duration);

  await new Promise<void>((resolve) => {
    let raf = 0;
    const tick = () => {
      const t = video.currentTime;
      if (duration) onProgress?.(Math.min(1, t / duration));
      const local = t - effectStart;
      ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
      const zoom =
        preset.scale && local >= 0 && local <= preset.duration ? preset.scale(local) : 1;
      drawFootage(ctx, video, zoom);
      if (preset.draw && local >= 0 && local <= preset.duration) {
        ctx.save();
        preset.draw(ctx, local, preset.duration, values);
        ctx.restore();
      }
      if (video.ended || (duration && t >= duration - 0.05)) {
        cancelAnimationFrame(raf);
        resolve();
        return;
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
