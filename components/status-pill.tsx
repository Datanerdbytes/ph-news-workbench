import { cn } from "cn";

export function statusMeta(status: string) {
  switch (status) {
    case "drafted":
      return {
        label: "Drafted",
        dot: "bg-facebook",
        pill: "border-facebook/20 bg-facebook/10 text-facebook",
      };
    case "published":
      return {
        label: "Published",
        dot: "bg-emerald-600",
        pill: "border-emerald-600/20 bg-emerald-600/10 text-emerald-700",
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
        dot: "bg-amber-600",
        pill: "border-amber-600/20 bg-amber-600/10 text-amber-700",
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
        dot: "bg-amber-500",
        pill: "border-amber-500/20 bg-amber-500/10 text-amber-700",
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
