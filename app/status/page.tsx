'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppFrame } from '@/components/app-frame';
import { StatusPill } from '@/components/status-pill';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { formatDateTime } from '@/lib/format';

type Draft = {
  id: number;
  news_item_id: number;
  status: string;
  error_message: string | null;
  correlation_id: string;
  created_at: string;
  news_title: string | null;
};

export default function StatusPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/drafts', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load drafts.');
      setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
      setNextCursor(
        typeof data?.nextCursor === 'number' ? data.nextCursor : null
      );
      setHasMore(Boolean(data?.hasMore));
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      toast.error('Could not load drafts', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/drafts?before=${nextCursor}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load more drafts.');
      const page: Draft[] = Array.isArray(data?.drafts) ? data.drafts : [];
      setDrafts((prev) => {
        const seen = new Set(prev.map((draft) => draft.id));
        return [...prev, ...page.filter((draft) => !seen.has(draft.id))];
      });
      setNextCursor(
        typeof data?.nextCursor === 'number' ? data.nextCursor : null
      );
      setHasMore(Boolean(data?.hasMore));
    } catch (error) {
      toast.error('Could not load more drafts', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const ready = drafts.filter((draft) => draft.status === 'drafted').length;
  const failed = drafts.filter((draft) => draft.status === 'failed').length;

  const stats = [
    {
      label: 'Total drafts',
      value: drafts.length,
      hint: 'Loaded so far',
      icon: FileText,
      tone: 'text-foreground',
    },
    {
      label: 'Waiting for review',
      value: ready,
      hint: 'Generated successfully',
      icon: CheckCircle2,
      tone: 'text-facebook',
    },
    {
      label: 'Failed',
      value: failed,
      hint: 'Needs attention',
      icon: AlertTriangle,
      tone: failed ? 'text-destructive' : 'text-muted-foreground',
    },
  ];

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Open story queue
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-brand">Publishing desk</p>
            <h1 className="mt-2 font-heading text-4xl tracking-[-0.02em]">
              Drafts &amp; activity
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Every generated draft, its status, and the correlation trail for
              auditing.
            </p>
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
              className={refreshing ? 'size-3.5 animate-spin' : 'size-3.5'}
              aria-hidden
            />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/80 bg-card p-4 paper-shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="eyebrow text-muted-foreground">
                  {stat.label}
                </span>
                <stat.icon
                  className={`size-4 ${stat.tone}`}
                  aria-hidden
                />
              </div>
              <p className="mt-2 font-heading text-3xl tabular-nums">
                {loadError ? "—" : stat.value}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {stat.hint}
              </p>
            </div>
          ))}
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
            <span className="eyebrow text-muted-foreground">Activity log</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {drafts.length} records
            </span>
          </div>

          {loading ? (
            <div className="divide-y divide-border/50">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="animate-pulse px-5 py-4">
                  <div className="h-2 w-20 rounded bg-muted" />
                  <div className="mt-2.5 h-4 w-2/3 rounded bg-muted" />
                  <div className="mt-2 h-2.5 w-1/3 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : drafts.length ? (
            <>
              <div className="divide-y divide-border/50">
                {drafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/drafts/${draft.id}`}
                    className="group grid gap-2 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={draft.status} />
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          Draft #{draft.id}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate font-heading text-[17px] leading-snug">
                        {draft.news_title ?? 'Unknown story'}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span>{formatDateTime(draft.created_at)}</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono text-[10px]">
                          {draft.correlation_id.slice(0, 8)}
                        </span>
                      </p>
                      {draft.error_message && (
                        <p className="mt-1.5 line-clamp-2 text-xs text-destructive">
                          {draft.error_message}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                      Open
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </span>
                  </Link>
                ))}
              </div>
              <div className="border-t border-border/50 px-5 py-3 text-center">
                {hasMore ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                  >
                    <Loader2
                      className={
                        loadingMore ? 'size-3.5 animate-spin' : 'size-3.5'
                      }
                      aria-hidden
                    />
                    {loadingMore ? 'Loading…' : 'Load more records'}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    All records loaded
                  </span>
                )}
              </div>
            </>
          ) : loadError ? (
            <ErrorState
              compact
              className="m-5"
              title="Couldn't load drafts"
              onRetry={load}
            />
          ) : (
            <div className="px-6 py-16 text-center">
              <FileText
                className="mx-auto size-5 text-faint/60"
                aria-hidden
              />
              <p className="mt-2 text-sm font-medium">No drafts yet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Generate a post from the story queue and it will appear here.
              </p>
              <Link
                href="/"
                className={buttonVariants({ variant: 'brand', size: 'sm', className: 'mt-4' })}
              >
                Open story queue
              </Link>
            </div>
          )}
        </section>

        {loading && (
          <div className="sr-only" role="status">
            <Loader2 className="size-4" aria-hidden />
            Loading drafts
          </div>
        )}
      </div>
    </AppFrame>
  );
}
