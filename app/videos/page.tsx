'use client';

import { useState } from 'react';
import { Film, ImagePlus, Video } from 'lucide-react';
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
      setFile(null);
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
    <PublishPage
      eyebrow="Publishing"
      title="Videos"
      description="Long-form Page video through the standard Video API: resumable chunked uploads, custom thumbnail, title and description, audience targeting, native scheduling, and crossposting."
      endpoint="POST /videos"
    >
      <ComposerCard
        icon={<Film className="size-4" />}
        title="New video"
        badge="MP4/MOV · 1 GB max"
        aside={
          <>
            <p className="font-semibold text-secondary-foreground">Chunked upload</p>
            <p>
              The server starts an upload session, transfers the file in 4 MB
              chunks, then finishes with metadata and an optional custom thumbnail.
            </p>
            <p>
              Videos longer than 90 seconds belong here rather than in Reels. Up to 45
              minutes are accepted.
            </p>
          </>
        }
      >
        <FilePicker
          id="video-file"
          accept="video/mp4,video/quicktime"
          label="Choose an MP4 or MOV"
          hint="1 GB max"
          file={file}
          onPick={setFile}
          onClear={() => setFile(null)}
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
    </PublishPage>
  );
}
