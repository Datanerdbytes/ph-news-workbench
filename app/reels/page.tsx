'use client';

import { useEffect, useRef, useState } from 'react';
import { Film, RefreshCw, Sparkles, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  ComposerCard,
  FieldLabel,
  FilePicker,
  PageSelector,
  PublishPage,
  ResultList,
  ScheduleField,
  defaultScheduleValue,
  inputClass,
  textareaClass,
  useManagedPages,
  type PublishResult,
} from '@/components/publishing/publish-page';

const MAX_BYTES = 100 * 1024 * 1024;
const RENDER_QUALITIES = ['draft', 'looks', 'delivery'] as const;
type RenderQuality = (typeof RENDER_QUALITIES)[number];
type RenderStatus = 'queued' | 'rendering' | 'done' | 'failed';

export default function ReelsPage() {
  const pages = useManagedPages();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'compose'>('upload');
  const [brief, setBrief] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [compositionId, setCompositionId] = useState<number | null>(null);
  const [compositionHtml, setCompositionHtml] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>('draft');
  const [renderId, setRenderId] = useState<number | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatus | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderLog, setRenderLog] = useState('');
  const [startingRender, setStartingRender] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function loadPreview(id: number) {
    setPreviewError(null);
    try {
      const res = await fetch(`/api/hyperframes/compositions/${id}/preview`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'The live preview could not be started.');
      }
      setPreviewUrl(data.url);
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : 'The live preview could not be started.'
      );
    }
  }

  async function generateComposition() {
    setComposing(true);
    setPreviewUrl(null);
    setPreviewError(null);
    setRenderError(null);
    setRenderId(null);
    setRenderStatus(null);
    setRenderLog('');
    try {
      const res = await fetch('/api/hyperframes/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          durationSeconds,
          ...(compositionId ? { compositionId } : {}),
        }),
      });
      const data = (await res.json()) as {
        id?: number;
        html?: string;
        error?: string;
      };
      if (!res.ok || !data.id || !data.html) {
        throw new Error(data.error ?? 'The composition could not be generated.');
      }
      setCompositionId(data.id);
      setCompositionHtml(data.html);
      await loadPreview(data.id);
    } catch (error) {
      toast.error('Could not generate the reel', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setComposing(false);
    }
  }

  async function startRender() {
    if (!compositionId) return;
    setStartingRender(true);
    setRenderError(null);
    setRenderStatus(null);
    setRenderLog('');
    try {
      const res = await fetch('/api/hyperframes/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compositionId, quality }),
      });
      const data = (await res.json()) as { renderId?: number; error?: string };
      if (!res.ok || !data.renderId) {
        throw new Error(data.error ?? 'The render could not be started.');
      }
      setRenderId(data.renderId);
      setRenderStatus('queued');
    } catch (error) {
      toast.error('Could not start render', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setStartingRender(false);
    }
  }

  useEffect(() => {
    if (!renderId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollRender() {
      try {
        const res = await fetch(`/api/hyperframes/render/${renderId}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          status?: RenderStatus;
          error?: string | null;
          logTail?: string | null;
        };
        if (!res.ok || !data.status) {
          throw new Error(data.error ?? 'Could not read render status.');
        }
        if (!active) return;
        setRenderStatus(data.status);
        setRenderError(data.error ?? null);
        setRenderLog(data.logTail ?? '');

        if (data.status === 'done') {
          const fileRes = await fetch(`/api/hyperframes/render/${renderId}/file`);
          if (!fileRes.ok) {
            const fileError = (await fileRes.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(fileError?.error ?? 'The rendered MP4 could not be downloaded.');
          }
          const blob = await fileRes.blob();
          if (!active) return;
          setFile(new File([blob], 'reel.mp4', { type: 'video/mp4' }));
          setActiveTab('upload');
          toast.success('Rendered MP4 attached', {
            description: 'Review the video, caption, Pages, and schedule before publishing.',
          });
          return;
        }
        if (data.status === 'failed') return;
        timer = setTimeout(() => void pollRender(), 3000);
      } catch (error) {
        if (!active) return;
        setRenderError(
          error instanceof Error ? error.message : 'Could not read render status.'
        );
        timer = setTimeout(() => void pollRender(), 3000);
      }
    }

    void pollRender();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [renderId]);

  async function post() {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Reels must be 100 MB or smaller.');
      return;
    }
    setBusy(true);
    setResults(null);
    try {
      const form = new FormData();
      form.append('video', file);
      form.append('caption', caption);
      if (scheduleOn) form.append('scheduledFor', new Date(scheduledFor).toISOString());
      form.append('pageIds', JSON.stringify(pages.selected));
      const res = await fetch('/api/reels', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The reel could not be posted.');
      setResults(data.results ?? []);
      toast.success(
        scheduleOn ? 'Reel scheduled' : 'Reel posted',
        { description: data.warning }
      );
      setFile(null);
      setCaption('');
    } catch (error) {
      toast.error('Reel upload failed', {
        description:
          error instanceof Error ? error.message : 'The reel could not be posted.',
      });
    } finally {
      setBusy(false);
      window.setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
        50
      );
    }
  }

  return (
    <PublishPage
      eyebrow="Publishing"
      title="Reels"
      description="Short vertical video published through the Page Reels endpoint. Uploads finish asynchronously, so this can take a minute."
      endpoint="POST /video_reels"
    >
      <ComposerCard
        icon={<Film className="size-4" />}
        title="New reel"
        badge="3–90s · 100 MB max"
        aside={
          <>
            <p className="font-semibold text-secondary-foreground">AI compose runs locally</p>
            <p>Composition can be generated remotely, but preview and rendering require this app to run locally.</p>
            <p className="font-semibold text-secondary-foreground">Reels endpoint</p>
            <p>
              The API starts an upload session, transfers the file, then finishes with
              <code className="mx-1 rounded bg-surface-3 px-1 py-0.5 text-[10px]">
                video_state
              </code>
              PUBLISHED or SCHEDULED.
            </p>
            <p>9:16 portrait is recommended; other ratios may be cropped in the Reels tab.</p>
          </>
        }
      >
        <div className="flex w-fit rounded-lg border border-border bg-surface-2 p-1" role="group" aria-label="Reel source">
          <button
            type="button"
            aria-pressed={activeTab === 'upload'}
            onClick={() => setActiveTab('upload')}
            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${activeTab === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Upload video
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'compose'}
            onClick={() => setActiveTab('compose')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${activeTab === 'compose' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Sparkles className="size-3" aria-hidden />
            AI compose
          </button>
        </div>

        {activeTab === 'upload' ? (
          <>
            <FilePicker
              id="reel-video"
              accept="video/mp4,video/quicktime"
              label="Choose an MP4 or MOV"
              hint="3–90s"
              file={file}
              onPick={setFile}
              onClear={() => setFile(null)}
              icon={<Video className="size-3.5" />}
            />

            <div>
              <FieldLabel htmlFor="reel-caption" hint={`${caption.length}/2200`}>
                Caption
              </FieldLabel>
              <textarea
                id="reel-caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                rows={4}
                maxLength={2200}
                placeholder="Write a caption for the reel…"
                className={textareaClass}
              />
            </div>

            <PageSelector
              pages={pages.pages}
              selected={pages.selected}
              onToggle={pages.toggle}
              loading={pages.loading}
            />

            <ScheduleField
              enabled={scheduleOn}
              onEnabled={setScheduleOn}
              value={scheduledFor}
              onChange={setScheduledFor}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="brand"
                size="sm"
                onClick={post}
                disabled={!file || busy || !pages.selected.length}
              >
                <Video className="size-3.5" aria-hidden />
                {busy ? 'Uploading…' : scheduleOn ? 'Schedule reel' : 'Post reel'}
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {scheduleOn
                  ? 'Facebook queues the reel and publishes it at the chosen time.'
                  : 'Publishes straight to the selected Page(s).'}
              </span>
            </div>

            <div ref={resultsRef}>
              {results && <ResultList results={results} />}
            </div>

            {preview && (
              <div className="aspect-[9/16] max-w-[200px] overflow-hidden rounded-lg border border-border bg-ink">
                <video
                  src={preview}
                  className="h-full w-full object-cover"
                  muted
                  loop
                  playsInline
                  controls
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <FieldLabel htmlFor="reel-brief" hint={`${brief.length}/2000`}>
                Reel brief
              </FieldLabel>
              <textarea
                id="reel-brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Describe the story, key facts, visual style, and any HTTPS image URLs the reel may use…"
                className={textareaClass}
              />
            </div>
            <div className="max-w-xs">
              <FieldLabel htmlFor="reel-duration">Target duration</FieldLabel>
              <select
                id="reel-duration"
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(Number(event.target.value))}
                className={`${inputClass} mt-1.5`}
              >
                {[15, 30, 60].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} seconds
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="brand"
                size="sm"
                onClick={() => void generateComposition()}
                disabled={
                  brief.trim().length < 10 ||
                  composing ||
                  startingRender ||
                  renderStatus === 'queued' ||
                  renderStatus === 'rendering'
                }
              >
                <Sparkles className="size-3.5" aria-hidden />
                {composing
                  ? 'Generating…'
                  : compositionId
                    ? 'Regenerate'
                    : 'Generate composition'}
              </Button>
              {composing && (
                <span className="text-[10.5px] text-muted-foreground">
                  Asking the selected composer model for a timed HTML reel…
                </span>
              )}
            </div>

            {compositionId && (
              <div className="space-y-4 rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold">Live composition preview</p>
                  {previewUrl && (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10.5px] font-semibold text-brand underline underline-offset-2"
                    >
                      Open preview
                    </a>
                  )}
                </div>
                {previewUrl ? (
                  <div className="aspect-[9/16] max-w-[230px] overflow-hidden rounded-lg border border-border bg-background">
                    <iframe
                      key={`${compositionId}-${compositionHtml.length}`}
                      title="HyperFrames reel preview"
                      src={previewUrl}
                      sandbox="allow-scripts allow-same-origin"
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {previewError ?? 'Starting the local preview server…'}
                  </p>
                )}
                {previewError && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] text-destructive">{previewError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void loadPreview(compositionId)}
                    >
                      Retry preview
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-36">
                    <FieldLabel htmlFor="reel-render-quality">Render quality</FieldLabel>
                    <select
                      id="reel-render-quality"
                      value={quality}
                      onChange={(event) => setQuality(event.target.value as RenderQuality)}
                      disabled={
                        composing ||
                        startingRender ||
                        renderStatus === 'queued' ||
                        renderStatus === 'rendering'
                      }
                      className={`${inputClass} mt-1.5`}
                    >
                      {RENDER_QUALITIES.map((option) => (
                        <option key={option} value={option}>
                          {option[0].toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="brand"
                    onClick={() => void startRender()}
                    disabled={
                      startingRender ||
                      composing ||
                      renderStatus === 'queued' ||
                      renderStatus === 'rendering'
                    }
                  >
                    <Video className="size-3.5" aria-hidden />
                    {startingRender ? 'Starting…' : 'Render MP4'}
                  </Button>
                </div>

                {renderStatus && (
                  <div
                    className="space-y-2 rounded-md border border-border bg-background p-3"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-2 text-[11px]">
                      {(renderStatus === 'queued' || renderStatus === 'rendering') && (
                        <RefreshCw className="size-3 animate-spin text-brand" aria-hidden />
                      )}
                      <span className="font-semibold">
                        {renderStatus === 'queued'
                          ? 'Render queued'
                          : renderStatus === 'rendering'
                            ? 'Rendering MP4…'
                            : renderStatus === 'done'
                              ? 'Render complete'
                              : 'Render failed'}
                      </span>
                    </div>
                    {renderError && (
                      <p className="text-[11px] text-destructive">{renderError}</p>
                    )}
                    {renderLog && (
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 text-[10px] leading-relaxed text-muted-foreground">
                        {renderLog}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </ComposerCard>
    </PublishPage>
  );
}
