'use client';

import type { ReactNode } from 'react';
import { cn } from 'cn';

/**
 * Light preview card for the sticky rail on media composers (Videos, Live,
 * Stories) — the same shell family as the platform previews (Facebook,
 * YouTube), wrapping a local-file preview instead of a mock post. The media
 * box stays black so photo/video reads correctly; the caller supplies its
 * aspect ratio, the media itself, the ready-state label, and the footer rows.
 */
export function MediaPreviewCard({
  statusLabel,
  ready,
  label = 'Preview',
  children,
  footer,
}: {
  /** Ready-state shown in the header pill, e.g. "Ready to publish". */
  statusLabel: string;
  /** Drives the status dot color in the header pill. */
  ready: boolean;
  /** Small tag on the header's right edge, e.g. "Story" or "Live". */
  label?: string;
  /** The media box — usually a MediaPreviewMedia. */
  children: ReactNode;
  /** Meta rows under the media (filename, explainer cards). */
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card paper-shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span
            className={cn('size-1.5 rounded-full', ready ? 'bg-success' : 'bg-faint')}
            aria-hidden
          />
          {statusLabel}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
      {footer && <div className="space-y-2.5 px-4 py-3">{footer}</div>}
    </div>
  );
}

/**
 * The black media box inside a MediaPreviewCard — full-bleed by default
 * (aspect-video video previews) or inset via className for vertical story
 * previews. Children render centered; overlays can position absolutely.
 */
export function MediaPreviewMedia({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-black',
        className
      )}
    >
      {children}
    </div>
  );
}
