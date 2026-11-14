'use client';

import { useState } from 'react';
import { Film, Play, TriangleAlert, Upload, Video } from 'lucide-react';
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
  ScheduleField,
  defaultScheduleValue,
  resolveScheduledFor,
  inputClass,
  mediaFileError,
  textareaClass,
  useManagedPages,
  type PublishResult,
} from '@/components/publishing/publish-page';
import {
  MediaPreviewCard,
  MediaPreviewMedia,
} from '@/components/publishing/media-preview-card';

const MAX_BYTES = 1024 * 1024 * 1024;

type VideosPublishResponse = {
  results?: PublishResult[];
  warning?: string;
  error?: string;
};

export default function VideosPage() {
  const pages = useManagedPages();
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targeting, setTargeting] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [scheduleError, setScheduleError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  function applyVideoFile(next: File | null) {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(next);
    setFileUrl(next ? URL.createObjectURL(next) : null);
    setPreviewFailed(false);
  }

  const videoPreview = (
    <MediaPreviewCard
      statusLabel={file ? 'Ready to publish' : 'Upload preview'}
      ready={Boolean(file)}
      label="Video"
      footer={
        <>
          {file && (
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold">{file.name}</p>
              <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)} MB · ready to publish
              </p>
            </div>
          )}
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted-foreground">
              <Upload className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold">Chunked upload</p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
                Title, description &amp; thumbnail · up to 45 minutes · 1 GB.
              </p>
            </div>
          </div>
        </>
      }
    >
      <MediaPreviewMedia className="aspect-video">
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
            <p className="text-[9.5px] leading-relaxed text-white/60">
              Its format may not play here, but it can still be published as-is.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-white/60">
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
      </MediaPreviewMedia>
    </MediaPreviewCard>
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
    let scheduledForIso: string | null = null;
    if (scheduleOn) {
      scheduledForIso = resolveScheduledFor(scheduledFor);
      if (!scheduledForIso) {
        setScheduleError(
          'Pick a time between 10 minutes and 75 days from now.'
        );
        return;
      }
      setScheduleError('');
    }

    setBusy(true);
    setResults(null);
    setUploadPct(0);
    try {
      const form = new FormData();
      form.append('video', file);
      form.append('title', title);
      form.append('description', description);
      if (thumbnail) form.append('thumbnail', thumbnail);
      if (targeting.trim()) form.append('feedTargeting', targeting.trim());
      if (scheduledForIso) form.append('scheduledFor', scheduledForIso);
      form.append('pageIds', JSON.stringify(pages.selected));

      // Real progress for the browser→workbench leg (GB-scale transfers sit
      // on this path for minutes); the chunked server→Facebook leg that
      // follows is the "Publishing…" phase.
      const data = await new Promise<VideosPublishResponse>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/videos');
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setUploadPct(Math.round((event.loaded / event.total) * 100));
            }
          };
          xhr.onload = () => {
            let body: VideosPublishResponse | null = null;
            try {
              body = JSON.parse(xhr.responseText) as VideosPublishResponse;
            } catch {
              body = null;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(body ?? {});
            } else {
              reject(
                new Error(body?.error ?? 'The video could not be published.')
              );
            }
          };
          xhr.onerror = () =>
            reject(new Error('The video could not be published.'));
          xhr.send(form);
        }
      );
      setResults(data.results ?? []);
      toast.success(scheduleOn ? 'Video scheduled' : 'Video published', {
        description: data.warning,
      });
      applyVideoFile(null);
      setThumbnail(null);
      setTitle('');
      setDescription('');
      // Don't leak geo-targeting or the schedule toggle into the next video.
      setTargeting('');
      setScheduleOn(false);
      setScheduleError('');
    } catch (error) {
      toast.error('Video upload failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  }

  return (
    <PublishPage eyebrow="Publishing" title="Videos">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0">
          <ComposerCard
            icon={<Film className="size-4" />}
            title="New video"
            badge="MP4/MOV · 1 GB max"
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
            validate={(picked) =>
              mediaFileError(picked, {
                types: ['video/mp4', 'video/quicktime'],
                extensions: ['.mp4', '.mov'],
                typeLabel: 'an MP4 or MOV file',
                maxBytes: MAX_BYTES,
                maxLabel: '1 GB',
              })
            }
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
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null;
                  event.target.value = '';
                  if (picked) {
                    const reason = mediaFileError(picked, {
                      types: ['image/jpeg', 'image/png', 'image/webp'],
                      typeLabel: 'a JPEG, PNG, or WebP image',
                      maxBytes: 20 * 1024 * 1024,
                      maxLabel: '20 MB',
                    });
                    if (reason) {
                      toast.error(reason);
                      return;
                    }
                  }
                  setThumbnail(picked);
                }}
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
            onChange={(next) => {
              setScheduledFor(next);
              setScheduleError('');
            }}
            error={scheduleError}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="brand"
              size="sm"
              onClick={publish}
              disabled={!file || busy || !pages.selected.length}
            >
              <Video className="size-3.5" aria-hidden />
              {busy
                ? uploadPct != null && uploadPct < 100
                  ? `Uploading ${uploadPct}%…`
                  : 'Publishing…'
                : scheduleOn
                  ? 'Schedule video'
                  : 'Publish video'}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {file
                ? `${(file.size / (1024 * 1024)).toFixed(1)} MB · uploads in 4 MB chunks`
                : 'Chunked upload — large files are fine.'}
            </span>
          </div>

            <ResultList results={results ?? []} />
          </ComposerCard>
        </div>
        <aside className="self-start xl:sticky xl:top-[70px]">{videoPreview}</aside>
      </div>
      <AssistantChat
        draft={description}
        onDraftChange={setDescription}
        contextLabel="video description (5,000 character limit)"
      />
    </PublishPage>
  );
}
