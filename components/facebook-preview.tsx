import {
  Globe2,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { cn } from "cn";
import { FacebookMark } from "@/components/facebook-mark";
import { imageSrc } from "@/lib/format";

type FacebookPreviewProps = {
  text: string;
  imageUrls?: string[];
  pageName?: string;
  connected?: boolean;
};

export function FacebookPreview({
  text,
  imageUrls = [],
  pageName = "Philippine News",
  connected = false,
}: FacebookPreviewProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <span className="eyebrow text-muted-foreground">Facebook preview</span>
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
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink font-heading text-sm text-paper">
                PH
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">
                  {pageName}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500">
                  Just now <span aria-hidden>·</span>
                  <Globe2 className="size-3" aria-hidden />
                  <span className="sr-only">Public</span>
                </p>
              </div>
              <MoreHorizontal className="mt-0.5 size-5 text-neutral-400" aria-hidden />
            </div>

            {text ? (
              <p className="mt-3 line-clamp-[14] whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">
                {text}
              </p>
            ) : (
              <p className="mt-3 rounded-md bg-neutral-50 px-3 py-5 text-center text-[12px] italic text-neutral-400">
                Your draft will appear here.
              </p>
            )}

            {imageUrls.length === 1 && (
              <img
                src={imageSrc(imageUrls[0])}
                alt="Post attachment preview"
                className="mt-3 max-h-72 w-full rounded-md border border-neutral-200 object-cover"
              />
            )}

            {imageUrls.length > 1 && (
              <div className="mt-3 grid grid-cols-2 gap-0.5 overflow-hidden rounded-md border border-neutral-200">
                {imageUrls.slice(0, 4).map((url, index) => (
                  <div
                    key={`${index}-${url.slice(-12)}`}
                    className={cn(
                      "relative bg-neutral-100",
                      imageUrls.length === 3 && index === 0 && "col-span-2"
                    )}
                  >
                    <img
                      src={imageSrc(url)}
                      alt={`Post attachment ${index + 1}`}
                      className={cn(
                        "w-full object-cover",
                        imageUrls.length === 3 && index === 0 ? "h-40" : "h-36"
                      )}
                    />
                    {index === 3 && imageUrls.length > 4 && (
                      <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold text-white">
                        +{imageUrls.length - 4}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
              <span className="flex items-center gap-1.5">
                <FacebookMark className="size-4" />
                {text ? "1" : "0"}
              </span>
              <span>0 comments · 0 shares</span>
            </div>

            <div className="mt-1 grid grid-cols-3 border-t border-neutral-100 pt-1 text-[12px] font-medium text-neutral-500">
              <span className="flex items-center justify-center gap-1.5 py-1.5">
                <ThumbsUp className="size-4" aria-hidden />
                Like
              </span>
              <span className="flex items-center justify-center gap-1.5 py-1.5">
                <MessageCircle className="size-4" aria-hidden />
                Comment
              </span>
              <span className="flex items-center justify-center gap-1.5 py-1.5">
                <Share2 className="size-4" aria-hidden />
                Share
              </span>
            </div>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <Globe2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {connected
            ? "Page connected — ready to publish."
            : "Preview only — connect your Facebook Page to publish."}
        </p>
      </div>
    </section>
  );
}
