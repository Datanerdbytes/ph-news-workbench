import { cn } from "cn";

/** PH mark + wordmark row shared by the auth screens (login's mobile header,
 * forgot-password, reset-password). */
export function AuthBrand({ className }: { className?: string }) {
  return (
    <div className={cn("mb-8 flex items-center gap-3", className)}>
      <span className="relative grid size-9 place-items-center rounded-[7px] bg-ink text-paper">
        <span className="font-heading text-[17px] leading-none">PH</span>
        <span className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full bg-brand" />
      </span>
      <span className="flex flex-col">
        <span className="font-heading text-lg leading-none">
          News Workbench
        </span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Philippine desk
        </span>
      </span>
    </div>
  );
}
