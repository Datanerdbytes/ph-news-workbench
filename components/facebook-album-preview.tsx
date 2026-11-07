import { Globe2 } from "lucide-react";
import { PageAvatar } from "@/components/publishing/page-selection";
import { imageSrc } from "@/lib/format";

type FacebookAlbumPreviewProps = {
  albumName?: string;
  description?: string;
  imageUrls?: string[];
  pageName?: string;
  pagePicture?: string | null;
  connected?: boolean;
  /** Photos already in the album — the grid adds what is selected now. */
  photoCount?: number | null;
};

/** Facebook album pages run a 3-column mosaic; mock the first screenful. */
const MAX_TILES = 9;

export function FacebookAlbumPreview({
  albumName,
  description = "",
  imageUrls = [],
  pageName = "Philippine News",
  pagePicture,
  connected = false,
  photoCount = null,
}: FacebookAlbumPreviewProps) {
  const tiles = imageUrls.slice(0, MAX_TILES);
  const overflow = imageUrls.length - tiles.length;
  const count = photoCount ?? imageUrls.length;

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <span className="eyebrow text-muted-foreground">
          Facebook album preview
        </span>
        <span
          className={
            connected
              ? "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-facebook"
              : "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          }
        >
          <span
            className={
              connected
                ? "size-1.5 rounded-full bg-facebook"
                : "size-1.5 rounded-full bg-brand"
            }
          />
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm">
          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              <PageAvatar
                page={{ name: pageName, picture: pagePicture }}
                className="size-10 text-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-neutral-500">
                  {pageName}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold leading-tight">
                  {albumName?.trim() ? albumName : "Untitled album"}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500">
                  {count > 0 && (
                    <>
                      <span>{`${count} photo${count === 1 ? "" : "s"}`}</span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  Just now <span aria-hidden>·</span>
                  <Globe2 className="size-3" aria-hidden />
                  <span className="sr-only">Public</span>
                </p>
              </div>
            </div>

            {description.trim() ? (
              <p className="mt-3 line-clamp-[8] whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">
                {description}
              </p>
            ) : (
              <p className="mt-3 rounded-md bg-neutral-50 px-3 py-4 text-center text-[12px] italic text-neutral-400">
                The album caption will appear here.
              </p>
            )}
          </div>

          {tiles.length ? (
            <div className="grid grid-cols-3 gap-0.5 border-y border-neutral-200">
              {tiles.map((url, index) => (
                <div
                  key={`${index}-${url.slice(-12)}`}
                  className="relative aspect-square bg-neutral-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageSrc(url)}
                    alt={`Album photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {index === MAX_TILES - 1 && overflow > 0 && (
                    <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold text-white">
                      +{overflow}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="m-3.5 grid place-items-center rounded-md border border-dashed border-neutral-300 px-3 py-8 text-center text-[12px] italic text-neutral-400">
              Photos you add will appear here.
            </div>
          )}
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <Globe2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {connected
            ? "Page connected — photos land in the selected album."
            : "Preview only — connect your Facebook Page to publish."}
        </p>
      </div>
    </section>
  );
}
