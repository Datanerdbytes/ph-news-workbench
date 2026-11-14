'use client';

import { useCallback, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { deleteStagedBlob } from '@/lib/blob-cleanup';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PlatformMark } from '@/components/platform-mark';
import {
  PlatformPublishPage,
  ComposerCard,
  FieldLabel,
  ResultList,
  ScheduleField,
  defaultScheduleValue,
  resolveScheduledFor,
  textareaClass,
  type PublishResult,
} from '@/components/publishing/publish-page';
import { InstagramPreview } from '@/components/instagram-preview';
import { useInstagramConnection } from '@/components/instagram-connection';
import { Button } from '@/components/ui/button';

const CAPTION_MAX = 2200;

/**
 * Instagram business access rides Facebook Login (the Basic Display login
 * was read-only and is retired), so the consent screen always comes from
 * Meta — spell that out before anyone bounces off it.
 */
const FACEBOOK_LOGIN_EXPECTED =
  ' The consent screen is Meta\u2019s Facebook Login, and that is expected \u2014 Instagram business publishing rides your Facebook account, not your Instagram login.';

function gateReasonNode(reason: string | null, detail: string | null) {
  if (reason === 'no_ig_account') {
    return (
      <>
        This Facebook Page has no professional Instagram account linked. Link
        one in Instagram, then press Connect again &mdash; the grant now
        carries instagram_basic and instagram_content_publish.
        {FACEBOOK_LOGIN_EXPECTED}
      </>
    );
  }
  if (reason === 'scope_missing') {
    return (
      <>
        The stored grant lacks {detail ?? 'Instagram publishing'} scopes. Press
        Connect to re-consent &mdash; the Meta app stacks the missing scopes
        on the same grant.
        {FACEBOOK_LOGIN_EXPECTED}
      </>
    );
  }
  return (
    <>
      Publishing tools post with the Instagram Graph API, so a business account
      must be connected first.
      {FACEBOOK_LOGIN_EXPECTED}
    </>
  );
}

export default function InstagramPage() {
  const connection = useInstagramConnection();
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [scheduleError, setScheduleError] = useState('');

  const pickImage = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Images must be 8 MB or smaller for Instagram posts.');
      return;
    }
    setStaging(true);
    try {
      const blob = await upload(
        `instagram/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`,
        file,
        { access: 'public', handleUploadUrl: '/api/blob', contentType: file.type }
      );
      setImageUrl(blob.url);
    } catch {
      toast.error('The image could not be staged.');
    } finally {
      setStaging(false);
    }
  }, []);

  const publish = useCallback(async () => {
    if (!imageUrl) {
      toast.error('Choose an image to publish.');
      return;
    }
    let scheduledForIso: string | null = null;
    if (scheduleOn) {
      scheduledForIso = resolveScheduledFor(scheduledFor);
      if (!scheduledForIso) {
        setScheduleError('Pick a time between 10 minutes and 75 days from now.');
        return;
      }
    }
    setBusy(true);
    try {
      const response = await fetch('/api/instagram/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: caption,
          imageUrl,
          ...(scheduledForIso ? { scheduledFor: scheduledForIso } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        id?: string;
        permalink?: string | null;
        scheduledFor?: string | null;
        account?: { name?: string };
        error?: string;
      } | null;
      if (!response.ok) {
        toast.error(data?.error ?? 'Instagram rejected the post.');
        setResults([
          {
            page: { id: 'ig', name: data?.account?.name ?? '@instagram' },
            ok: false,
            error: data?.error,
          },
        ]);
        return;
      }
      if (scheduledForIso) {
        toast.success('Instagram post scheduled', {
          description:
            'Instagram has no scheduling API — the workbench publishes it at the chosen time; the Calendar tracks it.',
        });
      } else {
        toast.success('Posted to Instagram', {
          description: data?.permalink ? 'Feed post is live.' : 'Published.',
        });
      }
      setResults([
        {
          page: { id: 'ig', name: data?.account?.name ?? '@instagram' },
          ok: true,
          id: data?.id,
          permalink: data?.permalink ?? null,
        },
      ]);
      setCaption('');
      setImageUrl(null);
      setScheduleOn(false);
      setScheduleError('');
    } catch {
      toast.error('The publish call could not be reached.');
    } finally {
      setBusy(false);
    }
  }, [caption, imageUrl, scheduleOn, scheduledFor]);

  const captionBytes = caption.length.toLocaleString();
  const canPublish = Boolean(imageUrl) && caption.trim().length > 0 && !staging && !busy;
  const reasonNode = gateReasonNode(connection.reason, connection.detail);

  return (
    <PlatformPublishPage
      eyebrow="Publishing"
      title="Instagram"
      mark={<PlatformMark platform="instagram" className="size-7" />}
      platformName="Instagram"
      gateHint={
        connection.reason === 'not_connected' ||
        connection.reason === 'scope_missing' ||
        connection.reason === 'no_ig_account'
          ? reasonNode
          : 'Publishing tools post with the Instagram Graph API, so a business account must be connected first.'
      }
      connectLabel="Connect Instagram"
      connection={connection}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <ComposerCard
            icon={<PlatformMark platform="instagram" className="size-4" />}
            title="Instagram post"
            badge="Feed"
            aside={
              <div className="space-y-2">
                <p>
                  Publishes to the linked professional account of your primary
                  Facebook Page.
                </p>
                <p className="text-muted-foreground">
                  Square 1:1 media works best. Captions up to{' '}
                  {CAPTION_MAX.toLocaleString()} characters.
                </p>
              </div>
            }
          >
            <div>
              <FieldLabel htmlFor="ig-image" hint="JPEG · PNG · WebP · ≤8 MB">
                Image
              </FieldLabel>
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 px-2 py-1.5">
                <label
                  htmlFor="ig-image"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {staging ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="size-3.5" aria-hidden />
                  )}
                  <span className="truncate">
                    {staging
                      ? 'Staging…'
                      : imageUrl
                        ? imageUrl.split('/').pop()?.slice(0, 40) ?? 'Image staged'
                        : 'Choose an image'}
                  </span>
                </label>
                <input
                  id="ig-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    void pickImage(event.target.files?.[0] ?? null);
                    event.target.value = '';
                  }}
                />
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      deleteStagedBlob(imageUrl);
                      setImageUrl(null);
                    }}
                    className="rounded px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Remove selected image"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            <div>
              <FieldLabel
                htmlFor="ig-caption"
                hint={`${captionBytes} / ${CAPTION_MAX.toLocaleString()}`}
              >
                Caption
              </FieldLabel>
              <textarea
                id="ig-caption"
                value={caption}
                maxLength={CAPTION_MAX}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="What should followers read with this image?"
                className={`${textareaClass} min-h-[96px]`}
              />
            </div>

            <ScheduleField
              enabled={scheduleOn}
              onEnabled={(next) => {
                setScheduleOn(next);
                setScheduleError('');
              }}
              value={scheduledFor}
              onChange={(value) => {
                setScheduledFor(value);
                setScheduleError('');
              }}
              error={scheduleError}
              label="Schedule on Instagram"
              hint="10 minutes to 75 days from now. Instagram has no scheduling API — the workbench publishes it at the chosen time."
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="brand" onClick={publish} disabled={!canPublish}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <PlatformMark platform="instagram" className="size-4" aria-hidden />
                )}
                {scheduleOn ? 'Schedule post' : 'Publish to Instagram'}
              </Button>
            </div>

            <ResultList results={results} />
          </ComposerCard>
        </div>

        <aside className="self-start xl:sticky xl:top-[70px]">
          <InstagramPreview
            imageUrl={imageUrl ?? null}
            caption={caption}
            username={connection.ig?.username ?? undefined}
            connected={connection.connected}
          />
        </aside>
      </div>
    </PlatformPublishPage>
  );
}
