'use client';

import { useState } from 'react';
import { ImagePlus, Sparkles, Video } from 'lucide-react';
import { toast } from 'sonner';
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
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);

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
      setPhoto(null);
      setPhotoUrl('');
      setVideo(null);
    } catch (error) {
      toast.error('Story upload failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublishPage eyebrow="Publishing" title="Stories">
      <ComposerCard
        icon={<Sparkles className="size-4" />}
        title="New story"
        badge="24 hours"
        aside={
          <>
            <p className="font-semibold text-secondary-foreground">How a story posts</p>
            <p>
              Photo stories upload an unpublished photo and commit its photo_id to
              /photo_stories. Video stories start a story upload, send the file to
              Facebook&apos;s upload URL, then finish with video_state=PUBLISHED.
            </p>
            <p>Vertical 9:16 assets fill the Story tray best.</p>
          </>
        }
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
              onPick={setPhoto}
              onClear={() => setPhoto(null)}
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
            onPick={setVideo}
            onClear={() => setVideo(null)}
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
    </PublishPage>
  );
}
