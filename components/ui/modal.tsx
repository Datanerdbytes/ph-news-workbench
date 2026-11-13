'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import {
  focusFirstIn,
  trapTabFocus,
  useDismissable,
} from '@/lib/dialog-a11y';

/**
 * True modal dialog: labelled by its title, Escape/backdrop closes, Tab is
 * trapped inside, focus moves in on open and returns to the trigger on
 * close. Built on the shared helpers in lib/dialog-a11y.
 */
export function Modal({
  open,
  onClose,
  title,
  initialFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Element to focus on open instead of the first focusable (e.g. a form input). */
  initialFocusRef?: React.RefObject<HTMLInputElement | null>;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  useDismissable(open, onClose, panelRef);

  useEffect(() => {
    if (!open) return;
    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (panelRef.current) {
      focusFirstIn(panelRef.current);
    }
    return () => returnFocus?.focus();
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={(event) => {
          if (panelRef.current) trapTabFocus(panelRef.current, event.nativeEvent);
        }}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id={headingId} className="font-semibold text-[15px]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
