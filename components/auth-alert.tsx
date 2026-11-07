import { AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "cn";

/** Inline notice on the auth screens: destructive alert (default) or neutral
 * status callout. */
export function AuthAlert({
  kind = "error",
  children,
}: {
  kind?: "error" | "status";
  children: React.ReactNode;
}) {
  const Icon = kind === "error" ? AlertCircle : ShieldCheck;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed",
        kind === "error"
          ? "border-destructive/20 bg-destructive/5 text-destructive"
          : "border-brand/25 bg-brand/5 text-foreground",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          kind === "status" && "text-brand",
        )}
        aria-hidden
      />
      {children}
    </div>
  );
}
