'use client';

import { useEffect, useRef, useState } from 'react';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import { upload } from '@vercel/blob/client';
import { AnimationPicker } from '@/components/reels/animation-picker';
import { FinalReelPreview } from '@/components/publishing/final-reel-preview';
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
  textareaClass,
  useManagedPages,
  type PublishResult,
} from '@/components/publishing/publish-page';
import { bakeReelAnimation } from '@/lib/reels/bake';
import {
  defaultPresetValues,
  getPreset,
  type PresetValues,
} from '@/lib/reels/presets';

const MAX_BYTES = 1024 * 1024 * 1024;

/**
 * Run a video blob through the normalizer (H.264 1080×1920). Returns the
 * original blob wrapped as a File when normalization is unavailable, so every
 * caller can keep going with a postable file either way.
 */
async function normalizeVideo(
  blob: Blob,
  name: string
): Promise<{ file: File; normalized: boolean; error?: string }> {
  const form = new FormData();
  form.append('video', blob, name);
  const res = await fetch('/api/reels/prepare', { method: 'POST', body: form });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    const base = name.replace(/\.[^.]+$/, '');
    return {
      file: new File([blob], name, { type: blob.type || 'video/mp4' }),
      normalized: false,
      error: data?.error ?? 'The video could not be normalized.',
    };
  }
  const out = await res.blob();
  const base = name.replace(/\.[^.]+$/, '');
  return {
    file: new File([out], `${base}.mp4`, { type: 'video/mp4' }),
    normalized: true,
  };
}

export default function ReelsPage() {
  const pages = useManagedPages();
  const [file, setFile] = useState<File | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [caption, setCaption] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [presetId, setPresetId] = useState<string | null>(null);
  const [presetValues, setPresetValues] = useState<Record<string, PresetValues>>(
    () => defaultPresetValues()
  );
  const [renderPct, setRenderPct] = useState<number | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const preset = getPreset(presetId);

  /**
   * Picked videos are normalized to H.264 1080×1920 before anything else:
   * Safari cannot preview AV1/HEVC downloads, and Facebook prefers standard
   * encodings. Falls back to the original file when normalization is
   * unavailable (non-local runtime).
   */
  async function handlePick(picked: File | null) {
    setFile(picked);
    if (!picked) return;
    setNormalizing(true);
    try {
      const { file: normalized, error } = await normalizeVideo(picked, picked.name);
      setFile(normalized);
      if (error) throw new Error(error);
      toast.success('Video normalized', {
        description: 'Converted to H.264 1080×1920 — previews everywhere and uploads cleanly.',
      });
    } catch (error) {
      toast.warning('Using the original video', {
        description:
          error instanceof Error ? error.message : 'Normalization failed.',
      });
    } finally {
      setNormalizing(false);
    }
  }

  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function post() {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Reels must be 1 GB or smaller.');
      return;
    }
    setBusy(true);
    setResults(null);
    setRenderPct(null);
    try {
      let uploadFile = file;
      // Bake the selected animation into the footage first: record the video
      // + GSAP overlay to WebM in the browser, then normalize back to MP4.
      if (preset && preset.id !== 'none' && fileUrl) {
        const webm = await bakeReelAnimation({
          videoUrl: fileUrl,
          presetId: preset.id,
          values: presetValues[preset.id] ?? {},
          onProgress: setRenderPct,
        }).catch((error: unknown) => {
          toast.warning('Posting without the animation', {
            description:
              error instanceof Error
                ? error.message
                : 'The animation could not be rendered in this browser.',
          });
          return null;
        });
        if (webm) {
          const baked = await normalizeVideo(webm, 'baked-reel.webm');
          if (baked.normalized) uploadFile = baked.file;
          else
            toast.warning('Posting without the animation', {
              description: baked.error ?? 'The baked reel could not be normalized.',
            });
        }
      }
      setRenderPct(null);
      // Stage the video straight to Blob from the browser — sidesteps the
      // serverless request-body limit so full-size reels post from production.
      // The server downloads it back and feeds the Facebook upload.
      const staged = await upload(
        `reels/${Date.now()}-${uploadFile.name.replace(/[^\w.-]+/g, '_')}`,
        uploadFile,
        {
          access: 'public',
          handleUploadUrl: '/api/blob',
          contentType: uploadFile.type || 'video/mp4',
          onUploadProgress: (progress) => setUploadPct(progress.percentage),
        }
      );
      const res = await fetch('/api/reels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          videoUrl: staged.url,
          filename: uploadFile.name,
          videoType: uploadFile.type || 'video/mp4',
          caption,
          pageIds: pages.selected,
          ...(scheduleOn
            ? { scheduledFor: new Date(scheduledFor).toISOString() }
            : {}),
        }),
      });
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
      setRenderPct(null);
      setUploadPct(null);
      window.setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
        50
      );
    }
  }

  return (
    <PublishPage eyebrow="Publishing" title="Reels">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
      <ComposerCard
        icon={<Video className="size-4" />}
        title="New reel"
        badge="3s–45min · 1 GB max"
      >
        <FilePicker
          id="reel-video"
          accept="video/mp4,video/quicktime"
          label="Choose an MP4 or MOV"
          hint="3s–45min"
          file={file}
          onPick={handlePick}
          onClear={() => setFile(null)}
          icon={<Video className="size-3.5" />}
        />
        {normalizing && (
          <p className="text-[10.5px] text-muted-foreground">
            Normalizing the video to H.264 1080×1920… (a few seconds)
          </p>
        )}

        <AnimationPicker
          value={presetId}
          values={presetValues}
          onSelect={setPresetId}
          onFieldChange={(id, key, text) =>
            setPresetValues((current) => ({
              ...current,
              [id]: { ...current[id], [key]: text },
            }))
          }
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
            onClick={post}
            disabled={!file || busy || !pages.selected.length}
          >
            <Video className="size-3.5" aria-hidden />
            {uploadPct != null
              ? `Staging ${Math.round(uploadPct)}%…`
              : renderPct != null
                ? `Rendering ${Math.round(renderPct * 100)}%…`
                : busy
                  ? 'Publishing…'
                  : scheduleOn
                    ? 'Schedule reel'
                    : 'Post reel'}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {uploadPct != null
              ? 'Uploading the video to storage — do not close this tab.'
              : renderPct != null
              ? `Baking “${preset?.name}” into the footage — keep this tab open.`
              : preset && preset.id !== 'none'
                ? `“${preset.name}” is rendered into the reel when you post.`
                : scheduleOn
                  ? 'Facebook queues the reel and publishes it at the chosen time.'
                  : 'Publishes straight to the selected Page(s).'}
          </span>
        </div>

        <div ref={resultsRef}>
          {results && <ResultList results={results} />}
        </div>
      </ComposerCard>
        </div>

        <div className="self-start xl:sticky xl:top-[70px]">
          <FinalReelPreview
            videoUrl={fileUrl}
            caption={caption}
            pageName={
              pages.pages.find((page) => page.id === pages.selected[0])?.name
            }
            pagePicture={
              pages.pages.find((page) => page.id === pages.selected[0])?.picture
            }
            preset={preset}
            presetValues={preset ? presetValues[preset.id] : undefined}
          />
        </div>
      </div>
      <AssistantChat
        draft={caption}
        onDraftChange={setCaption}
        contextLabel="reel caption (2,200 character limit)"
      />
    </PublishPage>
  );
}
