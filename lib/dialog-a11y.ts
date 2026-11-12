"use client";

import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type RefObject,
} from "react";

// React 19 supports the boolean `inert` attribute at runtime, but the
// repo's @types/react@18 doesn't type it yet — drop this augmentation
// once the types ship it.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<T> {
    inert?: boolean | undefined;
  }
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Shared dismissal behavior for header popovers and panels: close on
 * pointer-down outside the container and on Escape. Extracted from the
 * copy-pasted effects in app-frame and notifications. The close reason
 * lets callers return focus to the trigger on Escape (keyboard flow)
 * without yanking focus away from whatever the user just clicked.
 */
export function useDismissable(
  open: boolean,
  onClose: (reason: "escape" | "outside") => void,
  containerRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose("outside");
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose("escape");
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, containerRef]);
}

/**
 * SSR-safe media query via an external store — the server snapshot
 * assumes the narrow layout and the client corrects after hydration.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * Moves focus into an opened overlay: the first focusable element, or
 * the container itself (given a -1 tabindex) when it has none.
 */
export function focusFirstIn(container: HTMLElement): HTMLElement {
  const first = container.querySelector<HTMLElement>(FOCUSABLE);
  if (first) {
    first.focus();
    return first;
  }
  container.setAttribute("tabindex", "-1");
  container.focus();
  return container;
}

/**
 * Tab-cycling trap for modal surfaces (nav drawer, dialogs). Call from a
 * keydown handler while the surface is open.
 */
export function trapTabFocus(container: HTMLElement, event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE)
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && container.contains(active);
  if (event.shiftKey) {
    if (active === first || !inside) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !inside) {
    event.preventDefault();
    first.focus();
  }
}
