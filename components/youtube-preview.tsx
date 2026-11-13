'use client';

import { Bookmark, Film, ThumbsDown, ThumbsUp } from 'lucide-react';

/**
 * Mock of a YouTube watch card rendered from composer state — 16:9 media,
 * title, channel row. Decorative glyphs are aria-hidden.
 */
export function YouTubePreview({
  videoUrl,
  title,
  channelName = 'Your channel',
  privacy,
}: {
  videoUrl: string | null;
  title: string;
  channelName?: string;
  privacy: 'public' | 'unlisted' | 'private';
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video border-b border-border bg-surface-2">
        {videoUrl ? (
          <video
            src={videoUrl}
            // Short local scrub preview of the exact staged bytes — the same
            // surface YouTube's player will show after its own processing.
            controls
            preload="metadata"
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Film className="size-8" aria-hidden />
            <span className="sr-only">No video selected yet</span>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-white/85">
          {privacy === 'private'
            ? 'Private'
            : privacy === 'unlisted'
              ? 'Unlisted'
              : 'Public'}
        </span>
      </div>

      <div className="px-3 pb-3 pt-2">
        <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug">
          {title.trim() || (
            <span className="text-muted-foreground">Your title appears here…</span>
          )}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className="grid size-6 place-items-center rounded-full bg-[#cc0000] text-[9px] font-bold text-white"
            aria-hidden
          >
            Y
          </span>
          <span className="text-[10.5px] font-semibold">{channelName}</span>
          <span className="text-[10px] text-muted-foreground">· just now</span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-muted-foreground" aria-hidden>
          <ThumbsUp className="size-3.5" />
          <ThumbsDown className="size-3.5" />
          <Bookmark className="ml-auto size-3.5" />
        </div>
      </div>
    </div>
  );
}
