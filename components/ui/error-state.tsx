import { AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { Button } from "./button";

/**
 * Shared "failed to load" state — visually distinct from empty states
 * (destructive palette, matching the draft-detail error panel) so a
 * fetch failure never reads as "you have no data".
 */
export function ErrorState({
  title = "Couldn't load this data",
  description,
  onRetry,
  retrying = false,
  compact = false,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-destructive/20 bg-destructive/5 text-center",
        compact ? "px-4 py-6" : "px-8 py-12",
        className
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full bg-destructive/10 text-destructive",
          compact ? "size-9" : "size-11"
        )}
      >
        <AlertCircle className={compact ? "size-4" : "size-5"} aria-hidden />
      </span>
      <p
        className={cn(
          "mt-3 font-semibold text-destructive",
          compact ? "text-[12px]" : "text-sm"
        )}
      >
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
        >
          <RotateCcw
            className={cn("size-3.5", retrying && "animate-spin")}
            aria-hidden
          />
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
