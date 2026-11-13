'use client';

import { useCallback, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Film, Loader2, Music2, Trash2 } from 'lucide-react';
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
import { TikTokPreview } from '@/components/tiktok-preview';
import { useTikTokConnection } from '@/components/tiktok-connection';
import { Button } from '@/components/ui/button';

const CAPTION_MAX = 2200;

const PRIVACY_OPTIONS = [
  { value: 'SELF_ONLY', label: 'Only me (private)' },
  { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Mutual follow friends' },
  { value: 'PUBLIC_TO_EVERYONE', label: 'Public' },
] as const;

type Privacy = (typeof PRIVACY_OPTIONS)[number]['value'];

export default function TikTokPage() {
  const connection = useTikTokConnection();
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('SELF_ONLY');
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
        `tiktok/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`,
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
      const response = await fetch('/api/tiktok/videos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: caption,
          privacyStatus: privacy,
          videoUrl,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        id?: string;
        permalink?: string | null;
        account?: { name?: string };
        error?: string;
      } | null;
      if (!response.ok) {
        toast.error(data?.error ?? 'TikTok rejected the post.');
        setResults([
          {
            page: { id: 'tt', name: data?.account?.name ?? 'TikTok' },
            ok: false,
            error: data?.error,
          },
        ]);
        return;
      }
      toast.success('TikTok direct post opened', {
        description:
          'TikTok is pulling the file and processing it — check the post in your profile once it lands.',
      });
      setResults([
        {
          page: { id: 'tt', name: data?.account?.name ?? 'TikTok' },
          ok: true,
          id: data?.id,
          permalink: data?.permalink ?? null,
        },
      ]);
      setCaption('');
      setVideoUrl(null);
    } catch {
      toast.error('The publish call could not be reached.');
    } finally {
      setBusy(false);
    }
  }, [caption, privacy, videoUrl]);

  const canPublish =
    Boolean(videoUrl) && caption.trim().length > 0 && !staging && !busy;
  const sandbox = !connection.publicPostingApproved;

  return (
    <PlatformPublishPage
      eyebrow="Publishing"
      title="TikTok"
      mark={<PlatformMark platform="tiktok" className="size-7" />}
      platformName="TikTok"
      gateHint="Direct posts open through TikTok's Content Posting API, so the account must be connected first."
      connectLabel="Connect TikTok"
      connection={connection}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <ComposerCard
            icon={<PlatformMark platform="tiktok" className="size-4" />}
            title="TikTok direct post"
            badge="Video"
            aside={
              <div className="space-y-2">
                <p>
                  TikTok pulls the staged file straight from the workbench URL
                  when the post opens (PULL_FROM_URL).
                </p>
                {sandbox ? (
                  <p className="text-muted-foreground">
                    Sandbox approval: posts land as private (only you) until
                    TikTok clears the Content Posting API for this app.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Public posting is approved for this app.
                  </p>
                )}
              </div>
            }
          >
            <div>
              <FieldLabel htmlFor="tt-video" hint="MP4 · MOV · ≤1 GB staged">
                Video file
              </FieldLabel>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 px-2 py-1.5">
                <label
                  htmlFor="tt-video"
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
                  id="tt-video"
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
                htmlFor="tt-caption"
                hint={`${caption.length.toLocaleString()} / ${CAPTION_MAX.toLocaleString()} characters`}
              >
                Caption
              </FieldLabel>
              <textarea
                id="tt-caption"
                value={caption}
                maxLength={CAPTION_MAX}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="The hook, the story, the hashtags."
                className={`${textareaClass} min-h-[96px]`}
              />
            </div>

            <div>
              <FieldLabel htmlFor="tt-privacy">Visibility</FieldLabel>
              <select
                id="tt-privacy"
                value={privacy}
                onChange={(event) =>
                  setPrivacy(event.target.value as Privacy)
                }
                className={`${inputClass} mt-1.5 w-full max-w-xs`}
              >
                {PRIVACY_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={sandbox && option.value !== 'SELF_ONLY'}
                  >
                    {option.label}
                    {sandbox && option.value !== 'SELF_ONLY'
                      ? ' — after approval'
                      : ''}
                  </option>
                ))}
              </select>
              {sandbox && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Locked to private while the TikTok app is in sandbox review.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="brand" onClick={publish} disabled={!canPublish}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Music2 className="size-4" aria-hidden />
                )}
                Publish to TikTok
              </Button>
              {busy && (
                <span className="text-[11px] text-muted-foreground">
                  Opening the direct post — TikTok pulls the file afterwards.
                </span>
              )}
            </div>

            <ResultList results={results} />
          </ComposerCard>
        </div>

        <aside className="self-start xl:sticky xl:top-[70px]">
          <TikTokPreview
            videoUrl={videoUrl}
            caption={caption}
            handle={
              connection.account?.name
                ? `@${connection.account.name.replace(/^@/, '')}`
                : '@yourhandle'
            }
            thumbnail={connection.account?.thumbnail ?? null}
          />
        </aside>
      </div>
    </PlatformPublishPage>
  );
}
