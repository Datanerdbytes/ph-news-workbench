'use client';

import { useEffect, useSyncExternalStore } from 'react';

export type ManagedPage = {
  id: string;
  name: string;
  picture?: string | null;
  primary: boolean;
};

/**
 * Round page profile picture with an initials fallback — the real photo comes
 * from the Graph API and is stored per page at connect time.
 */
export function PageAvatar({
  page,
  className,
}: {
  page: { name: string; picture?: string | null };
  className?: string;
}) {
  const size = className ?? 'size-5 text-[9px]';
  if (page.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote CDN image with dynamic expiry, next/image offers nothing here
      <img
        src={page.picture}
        alt=""
        width={20}
        height={20}
        className={`shrink-0 rounded-full border border-border/70 bg-surface-2 object-cover ${className ?? 'size-5'}`}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-ink font-heading font-semibold text-paper ${size}`}
      aria-hidden
    >
      {page.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Workspace-wide publishing page selection, shared by every composer and the
 * sidebar so switching pages anywhere updates the app chrome everywhere.
 * Module-level external store — one fetch per session, `useSyncExternalStore`
 * for subscribe/snapshot semantics. Lives in its own leaf module because both
 * app-frame and the composers consume it (an app-frame → publish-page →
 * app-frame cycle would break module init).
 */
type PageSelectionState = {
  pages: ManagedPage[];
  selectedId: string | null;
  loading: boolean;
};

let pageSelectionSnapshot: PageSelectionState = {
  pages: [],
  selectedId: null,
  loading: true,
};
const pageSelectionListeners = new Set<() => void>();
let pageSelectionFetch: Promise<void> | null = null;

function emitPageSelection(next: PageSelectionState) {
  pageSelectionSnapshot = next;
  pageSelectionListeners.forEach((listener) => listener());
}

function ensurePageSelectionFetch() {
  if (pageSelectionFetch) return;
  pageSelectionFetch = fetch('/api/facebook/pages', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : { pages: [] }))
    .then((data: { pages?: ManagedPage[] }) => {
      const list = Array.isArray(data.pages) ? data.pages : [];
      emitPageSelection({
        pages: list,
        selectedId:
          pageSelectionSnapshot.selectedId ??
          (list.find((page) => page.primary) ?? list[0])?.id ??
          null,
        loading: false,
      });
    })
    .catch(() => {
      emitPageSelection({ ...pageSelectionSnapshot, loading: false });
    });
}

function subscribePageSelection(listener: () => void) {
  pageSelectionListeners.add(listener);
  return () => pageSelectionListeners.delete(listener);
}

export function useManagedPages() {
  const state = useSyncExternalStore(
    subscribePageSelection,
    () => pageSelectionSnapshot,
    () => pageSelectionSnapshot
  );

  useEffect(() => {
    ensurePageSelectionFetch();
  }, []);

  return {
    pages: state.pages,
    selected: state.selectedId ? [state.selectedId] : [],
    selectOne(id: string) {
      if (id === pageSelectionSnapshot.selectedId) return;
      emitPageSelection({ ...pageSelectionSnapshot, selectedId: id });
    },
    /**
     * Make `pageId` the workspace default (Settings → Publishing): flips the
     * stored `is_primary` flag and moves the live selection with it, so the
     * sidebar and composers reflect the change immediately.
     */
    async setPrimaryPage(pageId: string) {
      const previous = pageSelectionSnapshot;
      if (previous.pages.find((page) => page.primary)?.id === pageId) return;
      emitPageSelection({
        ...previous,
        pages: previous.pages.map((page) => ({
          ...page,
          primary: page.id === pageId,
        })),
        selectedId: pageId,
      });
      try {
        const res = await fetch('/api/facebook/pages/default', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pageId }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? 'Could not save the default Page.');
        }
      } catch (error) {
        emitPageSelection(previous);
        throw error;
      }
    },
    loading: state.loading,
  };
}
