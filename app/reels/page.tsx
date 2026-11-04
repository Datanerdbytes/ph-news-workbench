'use client';

import { useEffect, useRef, useState } from 'react';
import { Film, Video } from 'lucide-react';
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
  textareaClass,
  useManagedPages,
  type PublishResult,
} from '@/components/publishing/publish-page';

const MAX_BYTES = 100 * 1024 * 1024;

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

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
      </ComposerCard>
    </PublishPage>
  );
}
