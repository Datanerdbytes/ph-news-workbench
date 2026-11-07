'use client';

import { useState } from 'react';
import { ImagePlus, Sparkles, TriangleAlert, Video } from 'lucide-react';
import { toast } from 'sonner';
import { AssistantChat } from '@/components/assistant-chat';
import { Button } from '@/components/ui/button';
import {
  ComposerCard,
  FieldLabel,
  FilePicker,
  PageSelector,
  PublishPage,
  ResultList,
  inputClass,
  useManagedPages,
  type PublishResult,
} from '@/components/publishing/publish-page';

type Kind = 'photo' | 'video';

export default function StoriesPage() {
  const pages = useManagedPages();
  const [kind, setKind] = useState<Kind>('photo');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [brokenSource, setBrokenSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);

  function applyStoryPhoto(next: File | null) {
    if (photoBlobUrl) URL.revokeObjectURL(photoBlobUrl);
    setPhoto(next);
    setPhotoBlobUrl(next ? URL.createObjectURL(next) : null);
  }

  function applyStoryVideo(next: File | null) {
    if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    setVideo(next);
    setVideoBlobUrl(next ? URL.createObjectURL(next) : null);
  }

  const canPublish =
    kind === 'photo'
      ? Boolean(photo || /^https?:\/\//i.test(photoUrl.trim()))
      : Boolean(video);

  async function publish() {
    if (!canPublish) return;
    setBusy(true);
    setResults(null);
    try {
      const form = new FormData();
      form.append('kind', kind);
      if (kind === 'photo') {
        if (photo) form.append('photo', photo);
        else form.append('photoUrl', photoUrl.trim());
      } else if (video) {
        form.append('video', video);
      }
      form.append('pageIds', JSON.stringify(pages.selected));

      const res = await fetch('/api/stories', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The story could not be published.');
      setResults(data.results ?? []);
      toast.success('Story published', { description: data.warning });
      applyStoryPhoto(null);
      setPhotoUrl('');
      applyStoryVideo(null);
    } catch (error) {
      toast.error('Story upload failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const storySource =
    kind === 'photo'
      ? photoBlobUrl ?? (photoUrl.trim() || null)
      : videoBlobUrl;

  const storyAside = (
    <div className="relative isolate flex flex-col overflow-hidden rounded-xl bg-[#171923] p-4 text-white shadow-[0_12px_34px_-22px_rgba(16,24,40,.5)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 -z-10 size-[220px] rounded-full bg-[radial-gradient(circle,rgba(154,161,171,.25),transparent_68%)]"
      />
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/65">
          <span
            className={
              storySource
                ? 'size-1.5 rounded-full bg-[#79d2ae]'
                : 'size-1.5 rounded-full bg-white/70'
            }
          />
          {storySource ? 'Ready to publish' : 'Upload preview'}
        </span>
        <span className="font-mono text-[9px] uppercase text-white/35">Story</span>
      </div>

      <div className="relative mt-4 flex aspect-[9/16] max-h-[300px] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black">
        {storySource ? (
          brokenSource === storySource ? (
            <div className="flex flex-col items-center gap-1.5 px-4 text-center">
              <TriangleAlert className="size-4 text-warning" aria-hidden />
              <p className="text-[10px] font-semibold text-white/75">
                Can’t preview this item
              </p>
              <p className="text-[9.5px] leading-relaxed text-white/40">
                It can still be published as-is.
              </p>
            </div>
          ) : kind === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={storySource}
              src={storySource}
              alt="Photo story preview"
              onError={() => setBrokenSource(storySource)}
              className="h-full w-full object-contain"
            />
          ) : (
            <video
              key={storySource}
              src={storySource}
              controls
              playsInline
              preload="metadata"
              onError={() => setBrokenSource(storySource)}
              className="h-full w-full object-contain"
            />
          )
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-white/35">
            <span className="grid size-9 place-items-center rounded-full border border-white/25 bg-white/10">
              {kind === 'photo' ? (
                <ImagePlus className="size-3.5" aria-hidden />
              ) : (
                <Video className="size-3.5" aria-hidden />
              )}
            </span>
            <p className="text-[9.5px] leading-relaxed">
              {kind === 'photo'
                ? 'The photo story preview appears here once you add an image.'
                : 'The video story preview appears here once you choose an MP4 or MOV.'}
            </p>
          </div>
        )}
      </div>

      {kind === 'photo' && photo && (
        <div className="mt-3 min-w-0">
          <p className="truncate text-[12px] font-semibold text-white/90">
            {photo.name}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-white/40">
            {(photo.size / (1024 * 1024)).toFixed(1)} MB · ready to publish
          </p>
        </div>
      )}
      {kind === 'photo' && !photo && photoUrl.trim() && (
        <div className="mt-3 min-w-0">
          <p className="truncate font-mono text-[9px] text-white/40">
            {photoUrl.trim()}
          </p>
        </div>
      )}
      {kind === 'video' && video && (
        <div className="mt-3 min-w-0">
          <p className="truncate text-[12px] font-semibold text-white/90">
            {video.name}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-white/40">
            {(video.size / (1024 * 1024)).toFixed(1)} MB · ready to publish
          </p>
        </div>
      )}

      <div className="mt-auto pt-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-white/70">
              <Sparkles className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-white/85">
                How a story posts
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-white/45">
                Vertical 9:16 assets fill the Story tray best.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <PublishPage eyebrow="Publishing" title="Stories">
      <ComposerCard
        icon={<Sparkles className="size-4" />}
        title="New story"
        badge="24 hours"
        aside={storyAside}
      >
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1 text-xs font-semibold">
          {(
            [
              ['photo', 'Photo story', ImagePlus],
              ['video', 'Video story', Video],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={
                kind === value
                  ? 'flex flex-1 items-center justify-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-foreground shadow-sm'
                  : 'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground'
              }
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {kind === 'photo' ? (
          <div className="space-y-3">
            <FilePicker
              id="story-photo"
              accept="image/jpeg,image/png,image/webp"
              label="Choose a JPEG, PNG, or WebP"
              hint="20 MB max"
              file={photo}
              onPick={applyStoryPhoto}
              onClear={() => applyStoryPhoto(null)}
              icon={<ImagePlus className="size-3.5" />}
            />
            <div>
              <FieldLabel htmlFor="story-photo-url" hint="Or paste a URL">
                Public image URL
              </FieldLabel>
              <input
                id="story-photo-url"
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                placeholder="https://…"
                className={inputClass}
                disabled={Boolean(photo)}
              />
            </div>
          </div>
        ) : (
          <FilePicker
            id="story-video"
            accept="video/mp4,video/quicktime"
            label="Choose an MP4 or MOV"
            hint="100 MB max"
            file={video}
            onPick={applyStoryVideo}
            onClear={() => applyStoryVideo(null)}
            icon={<Video className="size-3.5" />}
          />
        )}

        <PageSelector
          pages={pages.pages}
          selected={pages.selected}
          onSelect={pages.selectOne}
          loading={pages.loading}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="brand"
            size="sm"
            onClick={publish}
            disabled={!canPublish || busy || !pages.selected.length}
          >
            <Sparkles className="size-3.5" aria-hidden />
            {busy ? 'Publishing…' : 'Publish story'}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Publishes immediately — Stories have no native scheduling window.
          </span>
        </div>

        {results && <ResultList results={results} />}
      </ComposerCard>
      <AssistantChat />
    </PublishPage>
  );
}
