'use client';

import {
  Globe2,
  MessageCircle,
  MoreHorizontal,
  Play,
  Share2,
  ThumbsUp,
} from 'lucide-react';
import { FacebookMark } from '@/components/facebook-mark';

export function FinalReelPreview({
  videoUrl,
  caption,
  pageName = 'Philippine News',
}: {
  videoUrl: string | null;
  caption: string;
  pageName?: string;
}) {
  const ready = Boolean(videoUrl);

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <span className="eyebrow text-muted-foreground">Facebook preview</span>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span
            className={
              ready ? 'size-1.5 rounded-full bg-facebook' : 'size-1.5 rounded-full bg-brand'
            }
          />
          {ready ? 'Ready to post' : 'Awaiting reel'}
        </span>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm">
          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink font-heading text-sm text-paper">
                PH
              </span>
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
                <div className="mx-auto aspect-[9/16] max-h-[420px] overflow-hidden rounded-sm bg-black">
                  <video
                    src={videoUrl}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex aspect-[9/16] max-h-[420px] w-full flex-col items-center justify-center gap-1.5 rounded-sm bg-neutral-100 px-4 text-center text-neutral-400">
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
