import { cn } from "cn";

export function statusMeta(status: string) {
  switch (status) {
    case "drafted":
      return {
        label: "Drafted",
        dot: "bg-facebook",
        // --facebook (#1877f2) is ~4.2:1 at 10px — below AA. The strong
        // variant clears 4.5:1 on its tinted pill.
        pill: "border-facebook/20 bg-facebook/10 text-facebook-strong",
      };
    case "published":
      return {
        label: "Published",
        dot: "bg-success",
        pill: "border-success/20 bg-success/10 text-success",
      };
    case "failed":
      return {
        label: "Failed",
        dot: "bg-destructive",
        pill: "border-destructive/20 bg-destructive/10 text-destructive",
      };
    case "canceled":
      return {
        label: "Canceled",
        dot: "bg-warning",
        pill: "border-warning/20 bg-warning/10 text-warning",
      };
    case "scheduled":
      return {
        label: "Scheduled",
        dot: "bg-brand",
        pill: "border-brand/25 bg-brand/10 text-brand",
      };
    case "retrying":
      return {
        label: "Retrying",
        // Info blue keeps an in-progress retry visually distinct from the
        // terminal amber "Canceled" — the two used to share one recipe.
        dot: "bg-info",
        pill: "border-info/20 bg-info/10 text-info",
      };
    default:
      return {
        label: "Pending",
        dot: "bg-brand",
        pill: "border-brand/25 bg-brand/10 text-brand",
      };
  }
}

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        meta.pill,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}
