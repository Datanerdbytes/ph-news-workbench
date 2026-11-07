'use client';

import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Images, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { upload } from '@vercel/blob/client';
import { AssistantChat } from '@/components/assistant-chat';
import { FacebookPreview } from '@/components/facebook-preview';
import { FacebookAlbumPreview } from '@/components/facebook-album-preview';
import { useFacebookConnection } from '@/components/facebook-connection';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import {
  ComposerCard,
  FieldLabel,
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

const MAX_IMAGES = 10;
// Facebook rejects album photos above 10 MB — reject them here with a clear
// message instead of at Facebook with a raw error.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Album = {
  id: string;
  name: string;
  count: number | null;
  createdTime: string | null;
  link: string | null;
};

type Tab = 'feed' | 'albums';

export default function PhotosPage() {
  const pages = useManagedPages();
  const [tab, setTab] = useState<Tab>('feed');
  const [images, setImages] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumsLoaded, setAlbumsLoaded] = useState(false);
  const [albumId, setAlbumId] = useState('');
  const connection = useFacebookConnection();

  async function loadAlbums() {
    try {
      const res = await fetch('/api/photos/albums');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not load albums.');
      setAlbums(data.albums ?? []);
      setAlbumsLoaded(true);
    } catch (error) {
      toast.error('Albums unavailable', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  useEffect(() => {
    if (tab === 'albums' && !albumsLoaded) void loadAlbums();
  }, [tab, albumsLoaded]);

  async function addFiles(files: FileList | File[]) {
    const picked = Array.from(files);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    const accepted = picked.slice(0, room).filter((file) => {
      if (!ALLOWED.has(file.type)) {
        toast.error(`${file.name} is not a JPEG, PNG, or WebP image.`);
        return false;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 10 MB.`);
        return false;
      }
      return true;
    });
    if (picked.length > room) {
      toast.error(`Only ${room} more image${room === 1 ? '' : 's'} fit in one post.`);
    }
    // Stage straight to Blob — sidesteps the serverless request-body limit
    // and lets Facebook fetch the photos by URL instead of base64 payloads.
    try {
      const staged: string[] = [];
      for (const file of accepted) {
        const blob = await upload(
          `photos/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`,
          file,
          {
            access: 'public',
            handleUploadUrl: '/api/blob',
            contentType: file.type,
          }
        );
        staged.push(blob.url);
      }
      setImages((current) => [...current, ...staged].slice(0, MAX_IMAGES));
    } catch (error) {
      toast.error('Upload failed', {
        description:
          error instanceof Error
            ? error.message
            : 'The image could not be staged.',
      });
    }
  }

  function removeImage(index: number) {
    setImages((current) => {
      const removed = current[index];
      if (removed && removed.startsWith('http')) {
        // Best-effort staging cleanup; the blob is transient either way.
        void fetch('/api/blob', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: removed }),
        }).catch(() => {});
      }
      return current.filter((_, i) => i !== index);
    });
  }

  function restart() {
    setImages([]);
    setMessage('');
    setResults(null);
  }

  async function publishPost() {
    if (!images.length) return;
    setBusy(true);
    setResults(null);
    try {
      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: images.length === 1 ? 'single' : 'post',
          images,
          message,
          pageIds: pages.selected,
          scheduledFor: scheduleOn ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The photo post failed.');
      setResults(data.results ?? []);
      toast.success(scheduleOn ? 'Photo post scheduled' : 'Photo post published', {
        description: data.warning,
      });
      restart();
    } catch (error) {
      toast.error('Photo post failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function addToAlbum() {
    setBusy(true);
    try {
      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'album-add',
          albumId,
          images,
          message,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The photos could not be added.');
      toast.success('Photos added to album', {
        description: data.permalink ?? undefined,
      });
      restart();
      setAlbumsLoaded(false);
    } catch (error) {
      toast.error('Album upload failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const imagePicker = (
    <div>
      <FieldLabel htmlFor="photo-files" hint={`${images.length}/${MAX_IMAGES}`}>
        Images
      </FieldLabel>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {images.map((source, index) => (
          <div
            key={`${source.slice(0, 32)}-${index}`}
            className="group relative size-20 overflow-hidden rounded-lg border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source}
              alt={`Selected image ${index + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => removeImage(index)}
              aria-label={`Remove image ${index + 1}`}
              className="absolute right-0.5 top-0.5 rounded bg-ink/70 px-1 text-[10px] font-bold text-paper"
            >
              ×
            </button>
          </div>
        ))}
        {images.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid size-20 place-items-center rounded-lg border border-dashed border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Add images"
          >
            <ImagePlus className="size-5" aria-hidden />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        id="photo-files"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <p className="mt-1 text-[10px] text-muted-foreground">
        JPEG, PNG, or WebP under 10 MB. One image posts to /photos; several upload
        unattached and publish through /feed with attached_media.
      </p>
    </div>
  );

  const selectedPage = pages.pages.find((page) => page.id === pages.selected[0]);
  const selectedAlbum = albums.find((album) => album.id === albumId);

  return (
    <PublishPage eyebrow="Publishing" title="Photos">
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface-2 p-1 text-xs font-semibold">
        {(
          [
            ['feed', 'Photo posts', Images],
            ['albums', 'Albums', FolderPlus],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
              tab === value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {tab === 'feed' ? (
            <ComposerCard
              icon={<Images className="size-4" />}
              title="Photo post"
              badge="1–10 images"
              aside={
                <>
                  <p className="font-semibold text-secondary-foreground">How it posts</p>
                  <p>
                    A single image goes straight to
                    <code className="mx-1 rounded bg-surface-3 px-1 py-0.5 text-[10px]">/photos</code>.
                    Multiple images are uploaded unpublished first, then attached to one
                    feed post.
                  </p>
                  <p>Scheduling uses published=false with scheduled_publish_time.</p>
                </>
              }
            >
              {imagePicker}
              <div>
                <FieldLabel htmlFor="photo-message" hint={`${message.length}/63206`}>
                  Message
                </FieldLabel>
                <textarea
                  id="photo-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  maxLength={63206}
                  placeholder="Write the caption for this post…"
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
                  onClick={publishPost}
                  disabled={!images.length || busy || !pages.selected.length}
                >
                  <ImagePlus className="size-3.5" aria-hidden />
                  {busy ? 'Publishing…' : scheduleOn ? 'Schedule post' : 'Publish post'}
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  {images.length > 1
                    ? `${images.length} images in one carousel-style feed post.`
                    : 'Publishes to the selected Page(s).'}
                </span>
              </div>
              {results && <ResultList results={results} />}
            </ComposerCard>
          ) : (
            <div className="space-y-4">
              <ComposerCard
                icon={<ImagePlus className="size-4" />}
                title="Add photos to an album"
                aside={
                  <>
                    <p className="font-semibold text-secondary-foreground">Album upload</p>
                    <p>
                      Each photo is uploaded to the selected album. Albums belong to the
                      primary Page, so crossposting does not apply here.
                    </p>
                    <p>
                      Meta removed album creation from the Graph API — create albums on
                      Facebook directly and they will appear in this list.
                    </p>
                  </>
                }
              >
                <div>
                  <FieldLabel htmlFor="album-select" hint="Primary Page">
                    Album
                  </FieldLabel>
                  <select
                    id="album-select"
                    value={albumId}
                    onChange={(event) => setAlbumId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Choose an album…</option>
                    {albums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.name}
                        {album.count !== null ? ` (${album.count})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {imagePicker}
                <div>
                  <FieldLabel htmlFor="album-message">Caption</FieldLabel>
                  <textarea
                    id="album-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={3}
                    className={textareaClass}
                  />
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={addToAlbum}
                  disabled={!albumId || !images.length || busy}
                >
                  <ImagePlus className="size-3.5" aria-hidden />
                  {busy ? 'Uploading…' : 'Add photos'}
                </Button>
              </ComposerCard>
            </div>
          )}
        </div>

        <div className="self-start xl:sticky xl:top-5">
          {tab === 'feed' ? (
            <FacebookPreview
              text={message}
              imageUrls={images}
              connected={connection.connected}
              pageName={selectedPage?.name}
              pagePicture={selectedPage?.picture}
            />
          ) : (
            <FacebookAlbumPreview
              albumName={selectedAlbum?.name}
              description={message}
              imageUrls={images}
              connected={connection.connected}
              pageName={selectedPage?.name}
              pagePicture={selectedPage?.picture}
              photoCount={
                selectedAlbum?.count != null
                  ? selectedAlbum.count + images.length
                  : null
              }
            />
          )}
        </div>
      </div>
      <AssistantChat
        draft={message}
        onDraftChange={setMessage}
        contextLabel="photo post caption"
      />
    </PublishPage>
  );
}
