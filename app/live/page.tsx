'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Radio, RefreshCw, Square, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { AssistantChat } from '@/components/assistant-chat';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { ErrorState } from '@/components/ui/error-state';
import { cn } from 'cn';
import {
  ComposerCard,
  FieldLabel,
  PublishPage,
  ScheduleField,
  defaultScheduleValue,
  inputClass,
  textareaClass,
} from '@/components/publishing/publish-page';

type Stream = {
  id: number;
  facebookVideoId: string;
  title: string;
  description: string;
  status: string;
  streamKey: string | null;
  secureStreamUrl: string | null;
  permalink: string | null;
  plannedStartTime: string | null;
  createdAt: string;
};

type Comment = {
  id: string;
  message: string;
  author: string;
  createdTime: string | null;
};

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy the ${label.toLowerCase()}.`);
  }
}

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function LivePage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [fresh, setFresh] = useState<Stream | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/live${refresh ? '?refresh=1' : ''}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not load live streams.');
      setStreams(data.streams ?? []);
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      toast.error('Live streams unavailable', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/live', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          scheduledFor: scheduleOn ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The live stream could not be created.');
      setFresh(data.stream);
      setTitle('');
      setDescription('');
      setScheduleOn(false);
      toast.success('Live stream created', {
        description: 'Copy the server URL and stream key into your encoder.',
      });
      await load();
    } catch (error) {
      toast.error('Live stream creation failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const hasTitle = Boolean(title.trim());

  const liveAside = (
    <div className="relative isolate flex flex-col overflow-hidden rounded-xl bg-[#171923] p-4 text-white shadow-[0_12px_34px_-22px_rgba(16,24,40,.5)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 size-[220px] rounded-full bg-[radial-gradient(circle,rgba(154,161,171,.25),transparent_68%)]"
      />
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/65">
          <span
            className={
              hasTitle
                ? 'size-1.5 rounded-full bg-[#79d2ae]'
                : 'size-1.5 rounded-full bg-white/70'
            }
          />
          {hasTitle ? 'Ready to create' : 'Live preview'}
        </span>
        <span className="font-mono text-[9px] uppercase text-white/60">Live</span>
      </div>

      <div className="relative mt-4 flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black">
        {hasTitle ? (
          <>
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] text-white/85">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  scheduleOn ? 'bg-[#f0b429]' : 'bg-destructive animate-pulse'
                )}
                aria-hidden
              />
              {scheduleOn ? 'SCHEDULED' : 'LIVE'}
            </span>
            <div className="min-w-0 px-4 text-center">
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white/90">
                {title}
              </p>
              {description.trim() && (
                <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-white/60">
                  {description}
                </p>
              )}
            </div>
            <span className="absolute bottom-2 right-2.5 font-mono text-[8px] text-white/60">
              {scheduleOn && !Number.isNaN(new Date(scheduledFor).getTime())
                ? `Planned ${new Date(scheduledFor).toLocaleString()}`
                : 'Goes live when the encoder connects'}
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-white/60">
            <span className="grid size-9 place-items-center rounded-full border border-white/25 bg-white/10">
              <Radio className="size-3.5" aria-hidden />
            </span>
            <p className="text-[9.5px] leading-relaxed">
              The live preview appears here
              <br />
              once you add a title.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 min-w-0">
        <p className="truncate font-mono text-[9px] text-white/60">
          Title {title.length}/200 · Description {description.length}/5,000
        </p>
      </div>

      <div className="mt-auto pt-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-white/70">
              <Radio className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-white/85">
                Streaming endpoint
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-white/60">
                Facebook returns an RTMPS server URL and stream key — paste both
                into OBS or any RTMP encoder.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <PublishPage eyebrow="Publishing" title="Live video">
      <div className="space-y-4">
        <ComposerCard
          icon={<Radio className="size-4" />}
          title="Create live stream"
          aside={liveAside}
          asideWidth="lg:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div>
            <FieldLabel htmlFor="live-title" hint={`${title.length}/200`}>
              Title
            </FieldLabel>
            <input
              id="live-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="e.g. Afternoon news briefing"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="live-description" hint={`${description.length}/5000`}>
              Description
            </FieldLabel>
            <textarea
              id="live-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="What is this broadcast about?"
              className={textareaClass}
            />
          </div>
          <ScheduleField
            enabled={scheduleOn}
            onEnabled={setScheduleOn}
            value={scheduledFor}
            onChange={setScheduledFor}
          />
          <Button
            variant="brand"
            size="sm"
            onClick={create}
            disabled={!title.trim() || busy}
          >
            <Radio className="size-3.5" aria-hidden />
            {busy ? 'Creating…' : scheduleOn ? 'Schedule stream' : 'Create stream'}
          </Button>

          {fresh && (
            <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-xs font-semibold">{fresh.title}</p>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-muted-foreground">Server</span>
                  <code className="min-w-0 flex-1 truncate rounded bg-background px-1.5 py-0.5 font-mono">
                    {fresh.secureStreamUrl ?? '—'}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      fresh.secureStreamUrl &&
                      void copy(fresh.secureStreamUrl, 'Server URL')
                    }
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Copy server URL"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-muted-foreground">Key</span>
                  <code className="min-w-0 flex-1 truncate rounded bg-background px-1.5 py-0.5 font-mono">
                    {fresh.streamKey ?? 'Read from Facebook — see the stream below'}
                  </code>
                  <button
                    type="button"
                    onClick={() => fresh.streamKey && void copy(fresh.streamKey, 'Stream key')}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Copy stream key"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </ComposerCard>

        <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-brand" aria-hidden />
              <span className="text-sm font-semibold">Live streams</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void load(true)}
              disabled={loading}
            >
              <RefreshCw
                className={cn('size-3.5', loading && 'animate-spin')}
                aria-hidden
              />
              Refresh from Facebook
            </Button>
          </div>
          <div className="divide-y divide-border/60">
            {loading && !streams.length && (
              <p className="px-5 py-6 text-xs text-muted-foreground">
                Loading live streams…
              </p>
            )}
            {!loading && !streams.length && loadError && (
              <ErrorState
                compact
                title="Couldn't load live streams"
                onRetry={() => load()}
              />
            )}
            {!loading && !streams.length && !loadError && (
              <p className="px-5 py-6 text-xs text-muted-foreground">
                No live streams yet. Create one above to get an RTMPS server and key.
              </p>
            )}
            {streams.map((stream) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                onChanged={() => void load()}
              />
            ))}
          </div>
        </section>
      </div>
      <AssistantChat
        draft={description}
        onDraftChange={setDescription}
        contextLabel="live stream description (5,000 character limit)"
      />
    </PublishPage>
  );
}

function StreamCard({
  stream,
  onChanged,
}: {
  stream: Stream;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(stream.title);
  const [description, setDescription] = useState(stream.description);
  const [planned, setPlanned] = useState(toLocalInput(stream.plannedStartTime));
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentsBusy, setCommentsBusy] = useState(false);

  useEffect(() => {
    setTitle(stream.title);
    setDescription(stream.description);
    setPlanned(toLocalInput(stream.plannedStartTime));
  }, [stream.title, stream.description, stream.plannedStartTime]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/live/${stream.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          scheduledFor: planned ? new Date(planned).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The stream could not be updated.');
      toast.success('Live stream updated');
      onChanged();
    } catch (error) {
      toast.error('Update failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    try {
      const res = await fetch(`/api/live/${stream.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The stream could not be ended.');
      toast.success('Live stream ended');
      onChanged();
    } catch (error) {
      toast.error('Could not end the stream', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function loadComments() {
    setCommentsBusy(true);
    try {
      const res = await fetch(`/api/live/${stream.id}/comments`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not load comments.');
      setComments(data.comments ?? []);
    } catch (error) {
      toast.error('Comments unavailable', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCommentsBusy(false);
    }
  }

  const ended = stream.status === 'ENDED' || stream.status === 'VOD';

  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              ended
                ? 'bg-surface-3 text-muted-foreground'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {stream.status}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {stream.plannedStartTime
              ? `Planned ${new Date(stream.plannedStartTime).toLocaleString()}`
              : `Created ${new Date(stream.createdAt).toLocaleString()}`}
          </span>
          {stream.permalink && (
            <a
              href={stream.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-semibold text-brand underline-offset-2 hover:underline"
            >
              Open on Facebook
            </a>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            aria-label="Stream title"
            className={inputClass}
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
            placeholder="Description"
            aria-label="Stream description"
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Planned start
          <input
            type="datetime-local"
            value={planned}
            onChange={(event) => setPlanned(event.target.value)}
            disabled={ended}
            aria-label="Planned start time"
            className={cn(inputClass, 'h-8 w-auto text-xs')}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={save}
            disabled={busy || ended || !title.trim()}
          >
            Save details
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadComments}
            disabled={commentsBusy}
          >
            <MessageSquare className="size-3.5" aria-hidden />
            {commentsBusy ? 'Loading…' : 'Live comments'}
          </Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            onConfirm={end}
            disabled={busy || ended}
            confirmLabel="Confirm end"
            busyLabel="Ending…"
            cancelLabel="Keep streaming"
            icon={<Square className="size-3.5" aria-hidden />}
          >
            End stream
          </ConfirmButton>
        </div>
        {comments && (
          <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-background/60 p-2">
            {comments.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No comments yet.</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="text-[11px]">
                  <span className="font-semibold">{comment.author}</span>{' '}
                  <span className="text-muted-foreground">{comment.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5 rounded-lg border border-border bg-surface-2 p-2.5 text-[11px]">
        <p className="font-semibold">Encoder settings</p>
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-background px-1.5 py-0.5 font-mono">
            {stream.secureStreamUrl ?? '—'}
          </code>
          <button
            type="button"
            onClick={() =>
              stream.secureStreamUrl &&
              void copy(stream.secureStreamUrl, 'Server URL')
            }
            className="tap-target rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Copy server URL"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-background px-1.5 py-0.5 font-mono">
            {stream.streamKey ?? 'No stored key'}
          </code>
          <button
            type="button"
            onClick={() => stream.streamKey && void copy(stream.streamKey, 'Stream key')}
            className="tap-target rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Copy stream key"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
