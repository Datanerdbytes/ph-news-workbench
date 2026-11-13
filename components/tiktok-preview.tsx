'use client';

import { Bookmark, Heart, MessageCircle, Music2, Share2 } from 'lucide-react';

/**
 * Mock of a TikTok feed card rendered from composer state — vertical media,
 * action rail, caption block. Decorative glyphs are aria-hidden.
 */
export function TikTokPreview({
  videoUrl,
  caption,
  handle = '@yourhandle',
  thumbnail,
}: {
  videoUrl: string | null;
  caption: string;
  handle?: string;
  thumbnail?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <div className="relative aspect-[9/16] max-h-[430px] w-full">
        {videoUrl ? (
          <video
            src={videoUrl}
            // Scrub preview of the exact staged bytes — the same asset
            // TikTok pulls by URL when the direct post opens.
            controls
            preload="metadata"
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center text-white/40">
            <span className="sr-only">No video selected yet</span>
            <span className="text-xs font-medium tracking-wide">
              TikTok feed preview
            </span>
          </div>
        )}

        {/* Action rail */}
        <div
          className="absolute bottom-16 right-2 flex flex-col items-center gap-3 text-white"
          aria-hidden
        >
          <span className="grid size-8 place-items-center rounded-full bg-white/10 backdrop-blur">
            <Heart className="size-4 drop-shadow" />
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-white/10 backdrop-blur">
            <MessageCircle className="size-4 drop-shadow" />
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-white/10 backdrop-blur">
            <Bookmark className="size-4 drop-shadow" />
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-white/10 backdrop-blur">
            <Share2 className="size-4 drop-shadow" />
          </span>
        </div>

        {/* Caption block */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-3 pt-8">
          <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-white">
            {caption.trim() || (
              <span className="text-white/60">
                Your caption appears here…
              </span>
            )}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-white/90">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt=""
                className="size-4 rounded-full object-cover"
              />
            ) : (
              <span
                className="grid size-4 place-items-center rounded-full bg-white/25 text-[8px] font-bold"
                aria-hidden
              >
                {handle.slice(1, 2).toUpperCase()}
              </span>
            )}
            <span className="text-[10.5px] font-semibold">{handle}</span>
            <Music2 className="size-3 text-white/75" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
