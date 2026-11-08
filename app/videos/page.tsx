'use client';

import { useState } from 'react';
import { Film, ImagePlus, Play, TriangleAlert, Upload, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { AssistantChat } from '@/components/assistant-chat';
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

const MAX_BYTES = 1024 * 1024 * 1024;

export default function VideosPage() {
  const pages = useManagedPages();
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targeting, setTargeting] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  function applyVideoFile(next: File | null) {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(next);
    setFileUrl(next ? URL.createObjectURL(next) : null);
    setPreviewFailed(false);
  }

  const videoAside = (
    <div className="relative isolate flex flex-col overflow-hidden rounded-xl bg-[#171923] p-4 text-white shadow-[0_12px_34px_-22px_rgba(16,24,40,.5)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 size-[220px] rounded-full bg-[radial-gradient(circle,rgba(154,161,171,.25),transparent_68%)]"
      />
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/65">
          <span
            className={cn(
              "size-1.5 rounded-full",
              file ? "bg-[#79d2ae]" : "bg-white/70"
            )}
          />
          {file ? "Ready to publish" : "Upload preview"}
        </span>
        <span className="font-mono text-[9px] uppercase text-white/35">Preview</span>
      </div>

      <div className="relative mt-4 flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black">
        {file && fileUrl && !previewFailed ? (
          <video
            key={fileUrl}
            src={fileUrl}
            controls
            playsInline
            preload="metadata"
            onError={() => setPreviewFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : file && previewFailed ? (
          <div className="flex flex-col items-center gap-1.5 px-4 text-center">
            <TriangleAlert className="size-4 text-warning" aria-hidden />
            <p className="text-[10px] font-semibold text-white/75">
              Can’t preview this file
            </p>
            <p className="text-[9.5px] leading-relaxed text-white/40">
              Its format may not play here, but it can still be published as-is.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-white/35">
            <span className="grid size-9 place-items-center rounded-full border border-white/25 bg-white/10">
              <Play
                className="ml-0.5 size-3.5 fill-white/70 text-white/70"
                aria-hidden
              />
            </span>
            <p className="text-[9.5px] leading-relaxed">
              The video preview appears here
              <br />
              once you choose an MP4 or MOV.
            </p>
          </div>
        )}
      </div>

      {file && (
        <div className="mt-3 min-w-0">
          <p className="truncate text-[12px] font-semibold text-white/90">
            {file.name}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-white/40">
            {(file.size / (1024 * 1024)).toFixed(1)} MB · ready to publish
          </p>
        </div>
      )}

      <div className="mt-auto pt-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-white/70">
              <Upload className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-white/85">
                Chunked upload
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-white/45">
                Title, description &amp; thumbnail · up to 45 minutes · 1 GB.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  async function publish() {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Videos must be 1 GB or smaller.');
      return;
    }
    if (targeting.trim()) {
      try {
        const parsed = JSON.parse(targeting);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
      } catch {
        toast.error('Audience targeting must be a JSON object.', {
          description: 'Example: {"geo_locations":{"countries":["PH"]}}',
        });
        return;
      }
    }

    setBusy(true);
    setResults(null);
    try {
      const form = new FormData();
      form.append('video', file);
      form.append('title', title);
      form.append('description', description);
      if (thumbnail) form.append('thumbnail', thumbnail);
      if (targeting.trim()) form.append('feedTargeting', targeting.trim());
      if (scheduleOn) form.append('scheduledFor', new Date(scheduledFor).toISOString());
      form.append('pageIds', JSON.stringify(pages.selected));

      const res = await fetch('/api/videos', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The video could not be published.');
      setResults(data.results ?? []);
      toast.success(scheduleOn ? 'Video scheduled' : 'Video published', {
        description: data.warning,
      });
      applyVideoFile(null);
      setThumbnail(null);
      setTitle('');
      setDescription('');
    } catch (error) {
      toast.error('Video upload failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublishPage eyebrow="Publishing" title="Videos">
      <ComposerCard
        icon={<Film className="size-4" />}
        title="New video"
        badge="MP4/MOV · 1 GB max"
        aside={videoAside}
      >
        <FilePicker
          id="video-file"
          accept="video/mp4,video/quicktime"
          label="Choose an MP4 or MOV"
          hint="1 GB max"
          file={file}
          onPick={applyVideoFile}
          onClear={() => applyVideoFile(null)}
          icon={<Video className="size-3.5" />}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="video-title" hint={`${title.length}/200`}>
              Title
            </FieldLabel>
            <input
              id="video-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="Headline for the video"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="video-thumbnail" hint="JPEG/PNG/WebP · 20 MB">
              Thumbnail
            </FieldLabel>
            <input
              id="video-thumbnail"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-foreground"
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="video-description" hint={`${description.length}/5000`}>
            Description
          </FieldLabel>
          <textarea
            id="video-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Describe the video…"
            className={textareaClass}
          />
        </div>

        <div>
          <FieldLabel htmlFor="video-targeting" hint="Optional JSON">
            Audience targeting
          </FieldLabel>
          <textarea
            id="video-targeting"
            value={targeting}
            onChange={(event) => setTargeting(event.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'{"geo_locations":{"countries":["PH"]}}'}
            className={`${textareaClass} font-mono text-xs`}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Passed as feed_targeting, the same targeting format as Meta ads.
          </p>
        </div>

        <PageSelector
          pages={pages.pages}
          selected={pages.selected}
          onSelect={pages.selectOne}
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
            onClick={publish}
            disabled={!file || busy || !pages.selected.length}
          >
            <ImagePlus className="size-3.5" aria-hidden />
            {busy ? 'Uploading…' : scheduleOn ? 'Schedule video' : 'Publish video'}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {file
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB · uploads in 4 MB chunks`
              : 'Chunked upload — large files are fine.'}
          </span>
        </div>

        {results && <ResultList results={results} />}
      </ComposerCard>
      <AssistantChat
        draft={description}
        onDraftChange={setDescription}
        contextLabel="video description (5,000 character limit)"
      />
    </PublishPage>
  );
}
