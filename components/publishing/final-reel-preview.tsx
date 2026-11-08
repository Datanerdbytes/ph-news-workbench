'use client';

import { useEffect, useRef } from 'react';
import {
  Globe2,
  MessageCircle,
  MoreHorizontal,
  Play,
  Share2,
  ThumbsUp,
} from 'lucide-react';
import { FacebookMark } from '@/components/facebook-mark';
import { cn } from 'cn';
import { PageAvatar } from '@/components/publishing/page-selection';
import { presetStart, type PresetValues, type ReelPreset } from '@/lib/reels/presets';

const OVERLAY_W = 810; // 0.75× of the 1080×1920 design space
const OVERLAY_H = 1440;

export function FinalReelPreview({
  videoUrl,
  caption,
  pageName = 'Philippine News',
  pagePicture,
  preset,
  presetValues,
}: {
  videoUrl: string | null;
  caption: string;
  pageName?: string;
  pagePicture?: string | null;
  preset?: ReelPreset | null;
  presetValues?: PresetValues;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ready = Boolean(videoUrl);

  // Live animation overlay: a transparent canvas above the video redraws the
  // preset at the playhead's local time, so preview matches the baked result.
  // Camera presets (scale) transform the video element itself.
  const hasOverlay = Boolean(preset && (preset.draw || preset.scale) && videoUrl);
  useEffect(() => {
    if (!hasOverlay || !preset) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const local = video.currentTime - presetStart(preset, duration);
      const active = local >= 0 && local <= preset.duration;
      if (preset.scale) {
        const zoom = active ? preset.scale(local) : 1;
        video.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
      }
      if (!preset.draw) return;
      ctx.clearRect(0, 0, OVERLAY_W, OVERLAY_H);
      if (active) {
        ctx.save();
        ctx.scale(OVERLAY_W / 1080, OVERLAY_H / 1920);
        preset.draw(ctx, local, preset.duration, presetValues ?? {});
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      video.style.transform = '';
    };
  }, [hasOverlay, preset, presetValues, videoUrl]);

  return (
    <section className="relative isolate flex flex-col overflow-hidden rounded-xl bg-[#171923] p-4 text-white shadow-[0_12px_34px_-22px_rgba(16,24,40,.5)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 size-[220px] rounded-full bg-[radial-gradient(circle,rgba(154,161,171,.25),transparent_68%)]"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/65">
          <span
            className={
              ready
                ? 'size-1.5 rounded-full bg-[#79d2ae]'
                : 'size-1.5 rounded-full bg-white/70'
            }
          />
          {ready ? 'Ready to post' : 'Awaiting reel'}
        </span>
        <span className="font-mono text-[9px] uppercase text-white/35">
          Facebook
        </span>
      </div>

      <div className="mt-4 min-w-0">
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm">
          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              <PageAvatar
                page={{ name: pageName, picture: pagePicture }}
                className="size-10 text-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{pageName}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500">
                  Just now <span aria-hidden>·</span>
                  <Globe2 className="size-3" aria-hidden />
                  <span className="sr-only">Public</span>
                </p>
              </div>
              <MoreHorizontal className="mt-0.5 size-5 text-neutral-400" aria-hidden />
            </div>

            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">
              {caption.trim() || 'Your reel caption will appear here.'}
            </p>

            <div className="mt-3">
              {videoUrl ? (
                <div className="relative mx-auto aspect-[9/16] max-h-[300px] overflow-hidden rounded-sm bg-black">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    className={cn(
                      'h-full w-full will-change-transform',
                      hasOverlay ? 'object-cover' : 'object-contain'
                    )}
                  />
                  {hasOverlay && (
                    <canvas
                      ref={canvasRef}
                      width={OVERLAY_W}
                      height={OVERLAY_H}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    />
                  )}
                </div>
              ) : (
                <div className="flex aspect-[9/16] max-h-[300px] w-full flex-col items-center justify-center gap-1.5 rounded-sm bg-neutral-100 px-4 text-center text-neutral-400">
                  <Play className="size-5" aria-hidden />
                  <p className="text-[10.5px] font-medium leading-relaxed">
                    The final reel appears here once you attach a video.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
              <span className="flex items-center gap-1.5">
                <FacebookMark className="size-4" />
                Reel
              </span>
              <span>0 comments · 0 shares</span>
            </div>

            <div className="mt-1 grid grid-cols-3 border-t border-neutral-100 pt-1 text-[12px] font-medium text-neutral-500">
              <span className="flex items-center justify-center gap-1.5 py-1.5">
                <ThumbsUp className="size-4" aria-hidden />
                Like
              </span>
              <span className="flex items-center justify-center gap-1.5 py-1.5">
                <MessageCircle className="size-4" aria-hidden />
                Comment
              </span>
              <span className="flex items-center justify-center gap-1.5 py-1.5">
                <Share2 className="size-4" aria-hidden />
                Share
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
