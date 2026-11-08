'use client';

import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  Bookmark,
  ImageIcon,
} from 'lucide-react';
import { cn } from 'cn';

/**
 * Mock of an Instagram feed post rendered from composer state — square
 * media area, action bar, caption. Decorative glyphs are aria-hidden.
 */
export function InstagramPreview({
  imageUrl,
  caption,
  username = 'yourbrand',
  connected,
}: {
  imageUrl: string | null;
  caption: string;
  username?: string;
  connected: boolean;
}) {
  const initial = username?.trim()?.charAt(0)?.toUpperCase() || 'Y';
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-[10px] font-bold text-white"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold">{username}</p>
            <p className="text-[9.5px] text-muted-foreground">
              {connected ? 'Just now · Feed post' : 'Just now'}
            </p>
          </div>
        </div>
        <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden />
      </div>

      <div className="relative aspect-square border-y border-border bg-surface-2">
        {imageUrl ? (
          // The staged blob URL is the exact source Meta will fetch — inside
          // the mock frame it previews the real pixels, so <img> is correct.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Post media" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-faint">
            <ImageIcon className="size-8" aria-hidden />
            <span className="sr-only">No image selected yet</span>
          </div>
        )}
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-3 text-foreground" aria-hidden>
          <Heart
            className={cn(
              'size-4',
              caption ? 'fill-destructive text-destructive' : ''
            )}
          />
          <MessageCircle className="size-4" />
          <Send className="size-4" />
          <Bookmark className="ml-auto size-4" />
        </div>
        <p className="mt-2 text-[11px] font-semibold">
          {username}
          {caption ? ' liked this' : ''}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed">
          {caption ? (
            <>
              <span className="font-semibold">{username}</span> {caption}
            </>
          ) : (
            <span className="text-faint">Your caption appears here…</span>
          )}
        </p>
      </div>
    </div>
  );
}
