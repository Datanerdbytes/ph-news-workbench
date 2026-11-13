'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Edit2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { AppFrame } from '@/components/app-frame';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { timeAgo } from '@/lib/format';

type Feed = {
  id: number;
  workspace_id: string;
  url: string;
  title: string | null;
  last_fetched_at: string | null;
  error_message: string | null;
  enabled: boolean;
  created_at: string;
  item_count: number;
};

type PreviewItem = {
  title: string;
  link: string;
  published_at: string | null;
};

function FeedCard({
  feed,
  onToggle,
  onDelete,
  onFetchNow,
  onEdit,
  fetchingIds,
  togglingIds,
}: {
  feed: Feed;
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (feed: Feed) => void;
  onFetchNow: (id: number) => void;
  onEdit: (feed: Feed) => void;
  fetchingIds: Set<number>;
  togglingIds: Set<number>;
}) {
  const isFetching = fetchingIds.has(feed.id);
  const isToggling = togglingIds.has(feed.id);

  const getStatus = () => {
    if (!feed.enabled) return { label: 'Disabled', variant: 'secondary' as const, icon: XCircle };
    if (feed.error_message) return { label: 'Error', variant: 'destructive' as const, icon: AlertTriangle };
    if (!feed.last_fetched_at) return { label: 'Never fetched', variant: 'outline' as const, icon: Clock };
    return { label: 'Active', variant: 'default' as const, icon: CheckCircle };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[13px] truncate">{feed.title ?? 'Untitled Feed'}</h3>
            <Button
              variant={status.variant}
              size="sm"
              className="h-6 px-2 gap-1"
              disabled={isToggling}
            >
              <StatusIcon className="size-3" aria-hidden />
              {isToggling ? '...' : status.label}
            </Button>
          </div>
          <p className="mt-1 truncate text-[10.5px] text-muted-foreground">{feed.url}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Globe className="size-3" aria-hidden />
              {feed.item_count} stories
            </span>
            {feed.last_fetched_at && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                Last fetched {timeAgo(feed.last_fetched_at)}
              </span>
            )}
            {!feed.last_fetched_at && feed.enabled && (
              <span className="flex items-center gap-1 text-warning">
                <Clock className="size-3" aria-hidden />
                Never fetched
              </span>
            )}
          </div>
          {feed.error_message && (
            <p className="mt-2 text-[10.5px] text-destructive flex items-center gap-1">
              <AlertTriangle className="size-3" aria-hidden />
              {feed.error_message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(feed)}
            className="size-9"
            aria-label="Edit feed"
            disabled={isFetching || isToggling}
          >
            <Edit2 className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFetchNow(feed.id)}
            className="size-9"
            aria-label="Fetch now"
            disabled={isFetching || isToggling || !feed.enabled}
          >
            {isFetching ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(feed.id, !feed.enabled)}
            className="size-9"
            aria-label={feed.enabled ? 'Disable feed' : 'Enable feed'}
            disabled={isToggling}
          >
            {feed.enabled ? (
              <XCircle className="size-3.5 text-muted-foreground" aria-hidden />
            ) : (
              <CheckCircle className="size-3.5 text-success" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(feed)}
            className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete feed"
            disabled={isFetching || isToggling}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddFeedDialog({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
  submitting: boolean;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await onSubmit(url.trim());
      setUrl('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[15px]">Add RSS Feed</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <XCircle className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="feed-url" className="text-[12px]">Feed URL</Label>
            <Input
              id="feed-url"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="h-9 text-[12px]"
              disabled={submitting}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-[10.5px] text-destructive flex items-center gap-1">
              <AlertTriangle className="size-3" aria-hidden />
              {error}
            </p>
          )}
          <p className="text-[10.5px] text-muted-foreground">
            Enter the URL of an RSS or Atom feed. We&apos;ll fetch the title and preview the latest stories.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !url.trim()}>
              {submitting ? 'Adding…' : 'Add feed'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditFeedDialog({
  open,
  onClose,
  feed,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  feed: Feed | null;
  onSubmit: (id: number, title: string) => Promise<void>;
  submitting: boolean;
}) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (feed) setTitle(feed.title ?? '');
  }, [feed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feed) return;
    try {
      await onSubmit(feed.id, title.trim());
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update feed');
    }
  };

  if (!open || !feed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[15px]">Edit Feed</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <XCircle className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="feed-title" className="text-[12px]">Feed Title</Label>
            <Input
              id="feed-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Feed title"
              className="h-9 text-[12px]"
              disabled={submitting}
              autoFocus
            />
          </div>
          <p className="text-[10.5px] text-muted-foreground truncate">{feed.url}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  confirming,
  feedTitle,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  feedTitle: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[15px]">Delete Feed</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <XCircle className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Are you sure you want to delete <strong className="text-foreground">{feedTitle}</strong>?
          This will remove the feed from your sources. Previously fetched stories will remain in your queue.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SourcesPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const [deletingFeedId, setDeletingFeedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingIds, setFetchingIds] = useState<Set<number>>(new Set());
  const [togglingIds, setDisablingIds] = useState<Set<number>>(new Set());

  const loadFeeds = useCallback(async () => {
    try {
      const res = await fetch('/api/sources', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load feeds');
      const data = await res.json();
      setFeeds(data.feeds ?? []);
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      toast.error('Could not load sources', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const handleAddFeed = async (url: string) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add feed');
      toast.success('Feed added', { description: `${data.feed.title ?? 'Feed'} has been added.` });
      await loadFeeds();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditFeed = async (id: number, title: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update feed');
      toast.success('Feed updated');
      await loadFeeds();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFeed = async (id: number, enabled: boolean) => {
    setDisablingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update feed');
      toast.success(enabled ? 'Feed enabled' : 'Feed disabled');
      await loadFeeds();
    } catch (error) {
      toast.error('Could not update feed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setDisablingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleFetchNow = async (id: number) => {
    setFetchingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/sources/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch feed');
      toast.success('Feed fetched', {
        description: `${data.ingested ?? 0} new stories · ${data.skipped ?? 0} already seen`,
      });
      await loadFeeds();
    } catch (error) {
      toast.error('Could not fetch feed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setFetchingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };


  const confirmDelete = async () => {
    if (!deletingFeedId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sources/${deletingFeedId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete feed');
      toast.success('Feed deleted');
      await loadFeeds();
    } catch (error) {
      toast.error('Could not delete feed', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
      setDeletingFeedId(null);
      setDeleteDialogOpen(false);
    }
  };

  const openEditDialog = (feed: Feed) => {
    setEditingFeed(feed);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (feed: Feed) => {
    setDeletingFeedId(feed.id);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return (
      <AppFrame>
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 sm:px-6 lg:py-7">
          <p className="eyebrow">Manage</p>
          <h1 className="page-title mt-1">Sources</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Manage RSS feeds that populate your Story Queue.
          </p>
          <div className="mt-5 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse rounded-xl border border-border/80 bg-card p-4">
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
                <div className="mt-2 h-3 w-1/4 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[880px] px-4 py-6 sm:px-6 lg:py-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Manage</p>
            <h1 className="page-title mt-1">Sources</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Manage RSS feeds that populate your Story Queue.
            </p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} className="h-9">
            <Plus className="size-3.5" aria-hidden />
            Add source
          </Button>
        </div>

        {loadError ? (
          <ErrorState
            className="mt-5"
            title="Couldn't load your sources"
            onRetry={loadFeeds}
          />
        ) : feeds.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-full bg-secondary">
              <Globe className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <h2 className="mt-4 font-heading text-xl">No sources yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-sm mx-auto">
              Add your first RSS feed to start pulling stories into your Story Queue.
            </p>
            <Button variant="brand" size="sm" className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              Add your first feed
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {feeds.map(feed => (
              <FeedCard
                key={feed.id}
                feed={feed}
                onToggle={handleToggleFeed}
                onDelete={openDeleteDialog}
                onFetchNow={handleFetchNow}
                onEdit={openEditDialog}
                fetchingIds={fetchingIds}
                togglingIds={togglingIds}
              />
            ))}
          </div>
        )}

        <AddFeedDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          onSubmit={handleAddFeed}
          submitting={submitting}
        />
        <EditFeedDialog
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
            setEditingFeed(null);
          }}
          feed={editingFeed}
          onSubmit={handleEditFeed}
          submitting={submitting}
        />
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onClose={() => {
            setDeleteDialogOpen(false);
            setDeletingFeedId(null);
          }}
          onConfirm={confirmDelete}
          confirming={submitting}
          feedTitle={feeds.find(f => f.id === deletingFeedId)?.title ?? 'this feed'}
        />
      </div>
    </AppFrame>
  );
}