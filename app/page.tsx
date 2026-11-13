'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Copy,
  ImagePlus,
  Newspaper,
  PenLine,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { AppFrame } from '@/components/app-frame';
import { AssistantChat } from '@/components/assistant-chat';
import { FacebookMark } from '@/components/facebook-mark';
import { useFacebookConnection } from '@/components/facebook-connection';
import { FacebookPreview } from '@/components/facebook-preview';
import {
  PageSelector,
  resolveScheduledFor,
  scheduleBounds,
  useManagedPages,
} from '@/components/publishing/publish-page';
import { StatusPill, statusMeta } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { ConfirmIconButton } from '@/components/ui/confirm-button';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import {
  formatCost,
  formatDomain,
  formatLongDate,
  imageSrc,
  stripMarkdown,
  timeAgo,
  wordCount,
} from '@/lib/format';

type Item = {
  id: number;
  title: string;
  summary: string;
  link: string;
  status: string;
  created_at?: string;
  draft_id?: number | null;
};

type DraftStats = {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

type ItemCounts = {
  total: number;
  pending: number;
  drafted: number;
  published: number;
};

type StatusFilter = 'all' | 'pending' | 'drafted' | 'published';

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function defaultScheduleValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setHours(9, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`;
}

function WorkspaceSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="rounded-xl border border-border/80 bg-card p-5">
        <div className="h-2 w-24 rounded bg-muted" />
        <div className="mt-4 h-6 w-3/4 rounded bg-muted" />
        <div className="mt-2 h-6 w-1/2 rounded bg-muted" />
        <div className="mt-4 h-3 w-full rounded bg-muted" />
        <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
      </div>
      <div className="rounded-xl border border-border/80 bg-card p-5">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="mt-4 h-[220px] w-full rounded bg-muted/60" />
      </div>
    </div>
  );
}

function EmptyWorkspace({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="grid min-h-[55vh] place-items-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-secondary">
          <Newspaper className="size-5 text-faint" aria-hidden />
        </span>
        <h2 className="mt-4 font-heading text-2xl">The desk is quiet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Pull the latest stories from Inquirer, Rappler, and Philstar to start
          drafting.
        </p>
        <Button variant="brand" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh feeds
        </Button>
      </div>
    </div>
  );
}

export default function Home() {
  const facebook = useFacebookConnection();
  const pages = useManagedPages();
  const selectedPage = pages.pages.find((page) => page.id === pages.selected[0]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [draft, setDraft] = useState('');
  const [stats, setStats] = useState<DraftStats | null>(null);
  const [language, setLanguage] = useState<'en' | 'tl'>('en');
  const [images, setImages] = useState<string[]>([]);
  const [imagesBusy, setImagesBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [itemsLoading, setItemsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<ItemCounts | null>(null);
  const [pane, setPane] = useState<'queue' | 'compose'>('queue');
  const [refreshing, setRefreshing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowDeleting, setRowDeleting] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/items', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load the news feed');
      const data = await res.json();
      const list: Item[] = Array.isArray(data) ? data : (data.rows ?? []);
      setItems(list);
      setLoadError(false);
      setNextCursor(typeof data.nextCursor === 'number' ? data.nextCursor : null);
      setHasMore(Boolean(data.hasMore));
      setCounts(data.counts ?? null);
      setSelected((prev) => {
        if (prev) {
          const next = list.find((item) => item.id === prev.id);
          if (next) return next;
        }
        return list[0] ?? null;
      });
    } catch {
      setLoadError(true);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/items?before=${nextCursor}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Could not load more stories');
      const data = await res.json();
      const list: Item[] = data.rows ?? [];
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...list.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(typeof data.nextCursor === 'number' ? data.nextCursor : null);
      setHasMore(Boolean(data.hasMore));
    } catch {
      toast.error('Could not load more stories');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount =
    counts?.pending ?? items.filter((item) => item.status === 'pending').length;
  const draftedCount =
    counts?.drafted ?? items.filter((item) => item.status === 'drafted').length;
  const publishedCount =
    counts?.published ??
    items.filter((item) => item.status === 'published').length;
  const totalStories = counts?.total ?? items.length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus =
        statusFilter === 'all' || item.status === statusFilter;
      const matchesQuery =
        !needle ||
        `${item.title} ${item.summary}`.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [items, query, statusFilter]);

  function selectItem(item: Item) {
    if (selected?.id === item.id) return;
    selectionRef.current = item.id;
    setSelected(item);
    setPane('compose');
    setDraft('');
    setStats(null);
    setImages([]);
    setConfirmDelete(false);
    setScheduleOpen(false);
    if (item.draft_id) loadSavedDraft(item);
  }

  async function loadSavedDraft(item: Item) {
    setDraftLoadFailed(false);
    try {
      const res = await fetch(`/api/drafts/${item.draft_id}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setDraftLoadFailed(true);
        return;
      }
      const data = await res.json();
      if (selectionRef.current !== item.id) return;
      if (typeof data.text === 'string') setDraft(data.text);
      if (typeof data.input_tokens === 'number') {
        setStats({
          inputTokens: data.input_tokens,
          outputTokens: data.output_tokens ?? 0,
          estimatedCost: Number(data.estimated_cost) || 0,
        });
      }
    } catch {
      // Selection still works; flag it so the editor isn't mistaken for "no draft yet".
      setDraftLoadFailed(true);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      await load();
      toast.success('Feeds refreshed', {
        description: `${data.ingested ?? 0} new stories · ${data.skipped ?? 0} already seen`,
      });
    } catch (error) {
      toast.error('Could not refresh feeds', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function generateDraft() {
    if (!selected) return;
    setDrafting(true);
    setConfirmDelete(false);
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsItemId: selected.id, language }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) {
        throw new Error(data.error ?? 'The draft could not be generated.');
      }
      setDraft(data.text);
      setStats({
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        estimatedCost: data.estimatedCost,
      });
      toast.success('Draft ready', {
        description: 'Review and refine it before publishing.',
      });
      await load();
    } catch (error) {
      toast.error('Draft failed', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setDrafting(false);
    }
  }

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  async function compressImage(file: File): Promise<string> {
    const dataUrl = await readAsDataUrl(file);
    if (file.type === 'image/gif') return dataUrl;

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      element.src = dataUrl;
    });

    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longest > 1600 ? 1600 / longest : 1;
    if (scale === 1 && file.size < 900 * 1024) return dataUrl;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return dataUrl;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async function addImages(files: FileList | File[]) {
    const picked = Array.from(files);
    if (!picked.length) return;

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES} images.`);
      return;
    }

    setImagesBusy(true);
    const accepted: string[] = [];
    let skipped = 0;
    for (const file of picked) {
      if (
        accepted.length >= room ||
        !ALLOWED_IMAGE_TYPES.has(file.type) ||
        file.size > MAX_IMAGE_BYTES
      ) {
        skipped += 1;
        continue;
      }
      try {
        accepted.push(await compressImage(file));
      } catch {
        skipped += 1;
      }
    }

    if (accepted.length) {
      setImages((prev) => [...prev, ...accepted].slice(0, MAX_IMAGES));
      toast.success(
        accepted.length === 1
          ? 'Image attached'
          : `${accepted.length} images attached`
      );
    }
    if (skipped) {
      toast.error('Some files were skipped', {
        description: `Use JPEG, PNG, or WebP under 20 MB — up to ${MAX_IMAGES} images.`,
      });
    }
    setImagesBusy(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, position) => position !== index));
  }

  async function schedulePost() {
    if (!selected || !draft.trim()) return;
    const whenIso = resolveScheduledFor(scheduledFor);
    if (!whenIso) {
      setScheduleError('Pick a time between 10 minutes and 75 days from now.');
      return;
    }
    setScheduleError('');
    setScheduling(true);
    try {
      const when = new Date(whenIso);
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItemId: selected.id,
          draftId: selected.draft_id ?? undefined,
          text: draft,
          imageUrls: images,
          scheduledFor: whenIso,
          pageId: pages.selected[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not schedule the post.');
      toast.success('Post scheduled', {
        description: when.toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      });
      setScheduleOpen(false);
      // Refresh the queue so the row's status stops showing its pre-schedule state.
      await load();
    } catch (error) {
      toast.error('Scheduling failed', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setScheduling(false);
    }
  }

  async function deleteDraftFor(item: Item) {
    setDeleting(true);
    setRowDeleting(item.id);
    try {
      const res = await fetch(`/api/drafts?newsItemId=${item.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? 'The draft could not be deleted.');
      }
      if (selected?.id === item.id) {
        setDraft('');
        setStats(null);
        setImages([]);
        setConfirmDelete(false);
      }
      await load();
      toast.success('Draft deleted', {
        description: 'The story is back in Pending.',
      });
    } catch (error) {
      toast.error('Could not delete the draft', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setDeleting(false);
      setRowDeleting(null);
    }
  }

  async function publish() {
    if (!selected || !draft.trim()) return;

    if (!facebook.scopes.includes('pages_manage_posts')) {
      toast.error('Publishing permission missing', {
        description: 'Reconnect the Page so it can publish on your behalf.',
        action: { label: 'Reconnect', onClick: () => facebook.connect() },
      });
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsItemId: selected.id,
          message: draft,
          imageUrls: images,
          pageId: pages.selected[0],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? 'The post could not be published.');
      }

      toast.success(
        `Published to ${data.page?.name ?? facebook.page?.name ?? 'your Page'}`,
        {
          description: 'Your post is live on Facebook.',
          action: data.permalink
            ? {
                label: 'View post',
                onClick: () =>
                  window.open(data.permalink, '_blank', 'noopener,noreferrer'),
              }
            : undefined,
        }
      );
      await load();
    } catch (error) {
      toast.error('Publish failed', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setPublishing(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(stripMarkdown(draft));
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy the draft');
    }
  }

  const selectedMeta = selected ? statusMeta(selected.status) : null;
  const words = wordCount(draft);

  const canPublish = facebook.scopes.includes('pages_manage_posts');
  const publishHint = facebook.loading
    ? 'Checking Facebook connection…'
    : !facebook.configured
      ? 'Add Facebook app credentials to enable publishing'
      : !facebook.connected
        ? 'Connect your Facebook Page to publish'
        : selected?.status === 'published'
          ? 'This story is already published'
          : !canPublish
            ? 'Reconnect the Page to grant publishing permission'
            : !draft
              ? 'Write or generate a draft to publish'
              : 'Posts to your Page immediately';

  const filters: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: totalStories },
    { value: 'pending', label: 'Pending', count: pendingCount },
    { value: 'drafted', label: 'Drafted', count: draftedCount },
    ...(publishedCount
      ? [{ value: 'published' as const, label: 'Published', count: publishedCount }]
      : []),
  ];

  return (
    <AppFrame fill>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border/70">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow text-brand">
                  Editorial queue · {formatLongDate()}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="font-heading text-[32px] leading-none tracking-[-0.02em]">
                    Story Queue
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {loadError ? "—" : pendingCount} pending ·{' '}
                    {loadError ? "—" : draftedCount} drafted ·{' '}
                    {loadError ? "—" : totalStories} total
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={refreshing}
                aria-busy={refreshing}
                className="h-9 bg-card"
              >
                <RefreshCw
                  className={cn('size-3.5', refreshing && 'animate-spin')}
                  aria-hidden
                />
                {refreshing ? 'Refreshing…' : 'Refresh feeds'}
              </Button>
            </div>

            <div
              className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 md:hidden"
              role="group"
              aria-label="Story Queue sections"
            >
              <button
                type="button"
                onClick={() => setPane('queue')}
                aria-pressed={pane === 'queue'}
                className={cn(
                  'rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                  pane === 'queue'
                    ? 'bg-ink text-paper'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Story Queue · {filtered.length}
              </button>
              <button
                type="button"
                onClick={() => setPane('compose')}
                aria-pressed={pane === 'compose'}
                disabled={!selected}
                className={cn(
                  'rounded-md px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40',
                  pane === 'compose'
                    ? 'bg-ink text-paper'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Compose
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <div className="mx-auto grid h-full w-full max-w-[1680px] md:grid-cols-[340px_minmax(0,1fr)]">
            <aside
              className={cn(
                'min-h-0 flex-col border-b border-border/70 bg-paper/40 md:flex md:h-full md:border-b-0 md:border-r',
                pane === 'queue' ? 'flex' : 'hidden md:flex'
              )}
              aria-label="Story queue"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="eyebrow text-muted-foreground">
                    Story queue
                  </span>
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {filtered.length}
                  </span>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Newest first
                </span>
              </div>

              <div className="border-b border-border/60 px-3 py-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search stories"
                    aria-label="Search stories"
                    className="h-8 w-full bg-card pl-8 text-xs"
                  />
                </div>
              </div>

              <div
                className="flex gap-1 border-b border-border/60 px-3 py-2"
                role="group"
                aria-label="Filter stories"
              >
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    aria-pressed={statusFilter === filter.value}
                    className={cn(
                      'rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                      statusFilter === filter.value
                        ? 'bg-ink text-paper'
                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                    )}
                  >
                    {filter.label}
                    <span className="ml-1 tabular-nums opacity-60">
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {itemsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="animate-pulse border-b border-border/50 px-4 py-4"
                    >
                      <div className="h-2 w-24 rounded bg-muted" />
                      <div className="mt-2.5 h-3.5 w-full rounded bg-muted" />
                      <div className="mt-1.5 h-3.5 w-4/5 rounded bg-muted" />
                      <div className="mt-2.5 h-2.5 w-full rounded bg-muted" />
                    </div>
                  ))
                ) : filtered.length ? (
                  filtered.map((item) => {
                    const meta = statusMeta(item.status);
                    const active = selected?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'group relative border-b border-border/50 transition-colors',
                          active ? 'bg-card' : 'hover:bg-card/60'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectItem(item)}
                          className={cn(
                            'relative w-full px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
                            item.draft_id && 'pr-9'
                          )}
                        >
                          {active && (
                            <span
                              className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-brand"
                              aria-hidden
                            />
                          )}
                          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <span
                              className={cn('size-1.5 rounded-full', meta.dot)}
                              aria-hidden
                            />
                            {meta.label}
                            <span aria-hidden>·</span>
                            <span className="normal-case tracking-normal">
                              {formatDomain(item.link)}
                            </span>
                            {item.created_at && (
                              <span className="ml-auto normal-case tracking-normal">
                                {timeAgo(item.created_at)}
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1.5 font-heading text-[16px] leading-snug tracking-[-0.01em] text-foreground/90 group-hover:text-foreground">
                            {item.title}
                          </h3>
                          {item.summary && (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {item.summary}
                            </p>
                          )}
                        </button>
                        {item.draft_id ? (
                          <ConfirmIconButton
                            onConfirm={() => deleteDraftFor(item)}
                            idleLabel={`Delete draft for ${item.title}`}
                            armedLabel="Click again to delete this draft"
                            title="Delete draft"
                            disabled={rowDeleting === item.id}
                            className="tap-target absolute right-1.5 top-2.5 rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
                            icon={<Trash2 className="size-3.5" aria-hidden />}
                          />
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-6 py-12 text-center">
                    <Newspaper
                      className="mx-auto size-5 text-faint/60"
                      aria-hidden
                    />
                    <p className="mt-2 text-sm font-medium">No stories found</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Try another filter, load more stories, or refresh the
                      feeds.
                    </p>
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <footer className="shrink-0 border-t border-border/60 bg-card/60 px-3 py-2.5">
                  {hasMore ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      aria-busy={loadingMore}
                      className="w-full"
                    >
                      {loadingMore ? (
                        <RefreshCw
                          className="size-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <ChevronDown className="size-3.5" aria-hidden />
                      )}
                      {loadingMore ? 'Loading…' : 'Load more stories'}
                    </Button>
                  ) : (
                    <p className="py-1 text-center text-[10.5px] text-muted-foreground">
                      All stories loaded
                    </p>
                  )}
                  <p className="mt-1.5 text-center text-[10px] tabular-nums text-muted-foreground">
                    {items.length} loaded · {totalStories} total
                  </p>
                </footer>
              )}
            </aside>

            <section
              aria-label="Compose"
              className={cn(
                'min-h-0 min-w-0 flex-col md:flex',
                pane === 'compose' ? 'flex' : 'hidden md:flex'
              )}
            >
              <header className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => setPane('queue')}
                  aria-label="Back to story queue"
                  className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-card text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                </button>
                <div className="min-w-0">
                  <p className="eyebrow text-brand">Compose</p>
                  <h2 className="truncate text-sm font-semibold">
                    {selected ? selected.title : 'Select a story to begin'}
                  </h2>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6">
                {itemsLoading ? (
                  <WorkspaceSkeleton />
                ) : loadError ? (
                  <ErrorState
                    title="Couldn't load the news feed"
                    description="Your stories are safe — the feed just couldn't be fetched right now."
                    onRetry={load}
                  />
                ) : !selected ? (
                  <EmptyWorkspace onRefresh={refresh} />
                ) : (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
                    <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm xl:col-start-1 xl:row-start-1">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="eyebrow text-brand">Source story</span>
                          <StatusPill status={selected.status} />
                        </div>
                        <a
                          href={selected.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Read original
                          <ArrowUpRight className="size-3.5" aria-hidden />
                        </a>
                      </div>
                      <div className="px-5 py-4">
                        <h2 className="text-balance font-heading text-[24px] leading-[1.2] tracking-[-0.015em]">
                          {selected.title}
                        </h2>
                        {selected.summary && (
                          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                            {selected.summary}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/70">
                            {formatDomain(selected.link)}
                          </span>
                          <span aria-hidden>·</span>
                          <span>
                            {selected.created_at
                              ? `Ingested ${timeAgo(selected.created_at)}`
                              : 'Latest ingest'}
                          </span>
                          {selectedMeta && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{selectedMeta.label}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm xl:col-start-1 xl:row-start-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3">
                        <div className="flex items-center gap-2">
                          <PenLine className="size-4 text-brand" aria-hidden />
                          <span className="text-sm font-semibold">Draft</span>
                          <div
                            className="inline-flex items-center rounded-lg border border-border/80 bg-card p-0.5 shadow-paper-sm"
                            role="group"
                            aria-label="Draft language"
                          >
                            {(['en', 'tl'] as const).map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setLanguage(value)}
                                aria-pressed={language === value}
                                title={value === 'en' ? 'English' : 'Tagalog'}
                                className={cn(
                                  'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                  language === value
                                    ? 'bg-ink text-paper'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                {value.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                          <span>{words} words</span>
                          <span>{draft.length} chars</span>
                        </div>
                      </div>

                      {drafting && (
                        <div className="h-0.5 w-full overflow-hidden bg-brand/15">
                          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
                        </div>
                      )}

                      <div className="p-5">
                        {draftLoadFailed && !draft && (
                          <p
                            role="status"
                            className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
                          >
                            Couldn&apos;t load your saved draft — the editor
                            started empty. Select the story again to retry.
                          </p>
                        )}
                        <textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          placeholder="Generate a draft from the source story, or start writing here…"
                          aria-label="Facebook post draft"
                          className="min-h-[260px] w-full resize-y bg-transparent text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground"
                        />
                      </div>

                      <div className="border-t border-border/60 px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {images.map((source, index) => (
                            <div
                              key={`${index}-${source.slice(-24)}`}
                              className="group relative"
                            >
                              <img
                                src={imageSrc(source)}
                                alt={`Attachment ${index + 1}`}
                                className="size-16 rounded-md border border-border object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                aria-label={`Remove attachment ${index + 1}`}
                                className="tap-target absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-border bg-card text-faint shadow-sm transition-colors hover:border-destructive/40 hover:text-destructive"
                              >
                                <X className="size-3" aria-hidden />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            disabled={imagesBusy || images.length >= MAX_IMAGES}
                            aria-label="Add images to the post"
                            title={`Attach up to ${MAX_IMAGES} images`}
                            className="grid size-16 place-items-center rounded-md border border-dashed border-border text-faint transition-colors hover:border-brand/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {imagesBusy ? (
                              <RefreshCw
                                className="size-4 animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <ImagePlus className="size-4" aria-hidden />
                            )}
                          </button>
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            tabIndex={-1}
                            className="sr-only"
                            onChange={(event) =>
                              void addImages(event.target.files ?? [])
                            }
                          />
                          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                            {images.length}/{MAX_IMAGES} images
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3">
                        <div className="w-full -mb-1">
                          <PageSelector
                            pages={pages.pages}
                            selected={pages.selected}
                            onSelect={pages.selectOne}
                            loading={pages.loading}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                          {stats ? (
                            <>
                              <span>Input {stats.inputTokens} tokens</span>
                              <span>Output {stats.outputTokens} tokens</span>
                              <span className="font-medium text-foreground/70">
                                ~{formatCost(stats.estimatedCost)}
                              </span>
                            </>
                          ) : (
                            <span>No generation yet</span>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {draft ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={generateDraft}
                                disabled={drafting || !selected}
                              >
                                <RefreshCw
                                  className={cn(
                                    'size-3.5',
                                    drafting && 'animate-spin'
                                  )}
                                  aria-hidden
                                />
                                {drafting ? 'Regenerating…' : 'Regenerate'}
                              </Button>
                            ) : (
                              <Button
                                variant="brand"
                                size="sm"
                                onClick={generateDraft}
                                disabled={drafting || !selected}
                              >
                                <Sparkles className="size-3.5" aria-hidden />
                                {drafting ? 'Drafting…' : 'Draft post'}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={copy}
                              disabled={!draft}
                            >
                              <Copy className="size-3.5" aria-hidden />
                              Copy
                            </Button>
                            <Button
                              variant="brand"
                              size="sm"
                              onClick={publish}
                              disabled={
                                !draft ||
                                !facebook.connected ||
                                !pages.selected.length ||
                                publishing ||
                                selected?.status === 'published'
                              }
                              title={publishHint}
                              aria-describedby="publish-hint"
                            >
                              <FacebookMark className="size-4" />
                              {publishing ? 'Publishing…' : 'Publish'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setScheduleOpen((open) => !open)}
                              disabled={
                                !draft ||
                                !facebook.connected ||
                                !pages.selected.length ||
                                selected?.status === 'published'
                              }
                              aria-expanded={scheduleOpen}
                            >
                              <CalendarClock className="size-3.5" aria-hidden />
                              Schedule
                            </Button>
                            {selected?.draft_id ? (
                              confirmDelete ? (
                                <>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => selected && deleteDraftFor(selected)}
                                    disabled={deleting}
                                  >
                                    <Trash2 className="size-3.5" aria-hidden />
                                    {deleting ? 'Deleting…' : 'Confirm delete'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirmDelete(false)}
                                    disabled={deleting}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirmDelete(true)}
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                  Delete draft
                                </Button>
                              )
                            ) : null}
                          </div>
                          {scheduleOpen && (
                            <div className="mt-1 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
                              <label
                                htmlFor="scheduled-for"
                                className="text-[10.5px] font-medium text-muted-foreground"
                              >
                                Publish at
                              </label>
                              <input
                                id="scheduled-for"
                                type="datetime-local"
                                aria-label="Publish date and time"
                                min={scheduleBounds().min}
                                max={scheduleBounds().max}
                                value={scheduledFor}
                                onChange={(event) => {
                                  setScheduledFor(event.target.value);
                                  setScheduleError('');
                                }}
                                className="h-8 rounded-md border border-input bg-background px-2 text-[11.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                              />
                              {scheduleError && (
                                <p
                                  role="alert"
                                  className="w-full text-right text-[11px] text-destructive"
                                >
                                  {scheduleError}
                                </p>
                              )}
                              <Button
                                size="sm"
                                variant="brand"
                                onClick={schedulePost}
                                disabled={scheduling}
                              >
                                {scheduling ? 'Scheduling…' : 'Confirm schedule'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setScheduleOpen(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                          <p
                            id="publish-hint"
                            className="text-[10px] text-muted-foreground"
                          >
                            {publishHint}
                          </p>
                        </div>
                      </div>
                    </section>

                    <div className="xl:col-start-2 xl:row-span-2 xl:sticky xl:top-5">
                      <FacebookPreview
                        text={stripMarkdown(draft)}
                        imageUrls={images}
                        connected={facebook.connected}
                        pageName={
                          selectedPage?.name ?? facebook.page?.name
                        }
                        pagePicture={selectedPage?.picture}
                      />
                    </div>

                  </div>
                )}
              </div>
            </div>
          </section>
          </div>
        </div>
      </div>

      <AssistantChat
        draft={draft}
        storyId={selected?.id}
        onDraftChange={setDraft}
        contextLabel="story draft"
      />
    </AppFrame>
  );
}
