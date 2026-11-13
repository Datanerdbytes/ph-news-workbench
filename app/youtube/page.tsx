'use client';

import { useCallback, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Clapperboard, Film, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PlatformMark } from '@/components/platform-mark';
import {
  PlatformPublishPage,
  ComposerCard,
  FieldLabel,
  ResultList,
  textareaClass,
  inputClass,
  type PublishResult,
} from '@/components/publishing/publish-page';
import { YouTubePreview } from '@/components/youtube-preview';
import { useYouTubeConnection } from '@/components/youtube-connection';
import { Button } from '@/components/ui/button';

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'private', label: 'Private' },
] as const;

type Privacy = (typeof PRIVACY_OPTIONS)[number]['value'];

export default function YouTubePage() {
  const connection = useYouTubeConnection();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('private');
  const [madeForKids, setMadeForKids] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[]>([]);

  const pickVideo = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
      toast.error('Choose an MP4 or MOV file.');
      return;
    }
    setStaging(true);
    try {
      const blob = await upload(
        `youtube/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`,
        file,
        {
          access: 'public',
          handleUploadUrl: '/api/blob',
          contentType: file.type,
        }
      );
      setVideoUrl(blob.url);
    } catch {
      toast.error('The video could not be staged.');
    } finally {
      setStaging(false);
    }
  }, []);

  const publish = useCallback(async () => {
    if (!videoUrl) {
      toast.error('Choose a video file to upload.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/youtube/videos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          privacyStatus: privacy,
          madeForKids,
          videoUrl,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        id?: string;
        permalink?: string;
        account?: { name?: string };
        error?: string;
      } | null;
      if (!response.ok) {
        toast.error(data?.error ?? 'YouTube rejected the upload.');
        setResults([
          {
            page: { id: 'yt', name: data?.account?.name ?? 'YouTube' },
            ok: false,
            error: data?.error,
          },
        ]);
        return;
      }
      toast.success('Published to YouTube', {
        description: 'Processing happens in YouTube Studio; check it there.',
      });
      setResults([
        {
          page: { id: 'yt', name: data?.account?.name ?? 'YouTube' },
          ok: true,
          id: data?.id,
          permalink: data?.permalink ?? null,
        },
      ]);
      setTitle('');
      setDescription('');
      setVideoUrl(null);
    } catch {
      toast.error('The publish call could not be reached.');
    } finally {
      setBusy(false);
    }
  }, [title, description, privacy, madeForKids, videoUrl]);

  const canPublish =
    Boolean(videoUrl) && title.trim().length > 0 && !staging && !busy;

  return (
    <PlatformPublishPage
      eyebrow="Publishing"
      title="YouTube"
      mark={<PlatformMark platform="youtube" className="size-7" />}
      platformName="YouTube"
      gateHint="Publishing uploads with the YouTube Data API, so a channel must be connected first."
      connectLabel="Connect YouTube"
      connection={connection}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <ComposerCard
            icon={<PlatformMark platform="youtube" className="size-4" />}
            title="YouTube upload"
            badge="Video"
            aside={
              <div className="space-y-2">
                <p>
                  Uploads publish straight from the browser-stage to YouTube&apos;s
                  resumable upload endpoint.
                </p>
                <p className="text-muted-foreground">
                  Upload quota is ~6 videos per day on Google&apos;s default
                  allocation — it resets at midnight Pacific.
                </p>
              </div>
            }
          >
            <div>
              <FieldLabel htmlFor="yt-video" hint="MP4 · MOV · ≤1 GB staged">
                Video file
              </FieldLabel>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 px-2 py-1.5">
                <label
                  htmlFor="yt-video"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {staging ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Film className="size-3.5" aria-hidden />
                  )}
                  <span className="truncate">
                    {staging
                      ? 'Staging…'
                      : videoUrl
                        ? videoUrl.split('/').pop()?.slice(0, 40) ?? 'Video staged'
                        : 'Choose a video'}
                  </span>
                </label>
                <input
                  id="yt-video"
                  type="file"
                  accept="video/mp4,video/quicktime"
                  className="sr-only"
                  onChange={(event) => {
                    void pickVideo(event.target.files?.[0] ?? null);
                    event.target.value = '';
                  }}
                />
                {videoUrl && (
                  <button
                    type="button"
                    onClick={() => setVideoUrl(null)}
                    className="rounded px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Remove selected video"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            <div>
              <FieldLabel
                htmlFor="yt-title"
                hint={`${title.length.toLocaleString()} / ${TITLE_MAX.toLocaleString()} characters`}
              >
                Title
              </FieldLabel>
              <input
                id="yt-title"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="The headline, YouTube edition"
                className={inputClass}
              />
            </div>

            <div>
              <FieldLabel
                htmlFor="yt-description"
                hint={`${description.length.toLocaleString()} / ${DESCRIPTION_MAX.toLocaleString()}`}
              >
                Description
              </FieldLabel>
              <textarea
                id="yt-description"
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Context for the video — sourced stories, credits, links."
                className={`${textareaClass} min-h-[96px]`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="yt-privacy">Visibility</FieldLabel>
                <select
                  id="yt-privacy"
                  value={privacy}
                  onChange={(event) =>
                    setPrivacy(event.target.value as Privacy)
                  }
                  className={`${inputClass} mt-1.5`}
                >
                  {PRIVACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 py-1 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={madeForKids}
                    onChange={(event) => setMadeForKids(event.target.checked)}
                    className="size-4 accent-[var(--brand)]"
                  />
                  Made for kids
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="brand" onClick={publish} disabled={!canPublish}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Clapperboard className="size-4" aria-hidden />
                )}
                Publish to YouTube
              </Button>
              {busy && (
                <span className="text-[11px] text-muted-foreground">
                  Uploading the full file — large videos take a while.
                </span>
              )}
            </div>

            <ResultList results={results} />
          </ComposerCard>
        </div>

        <aside className="self-start xl:sticky xl:top-[70px]">
          <YouTubePreview
            videoUrl={videoUrl}
            title={title}
            channelName={connection.account?.name ?? 'Your channel'}
            privacy={privacy}
          />
        </aside>
      </div>
    </PlatformPublishPage>
  );
}
