import { cn } from "cn";

export function FacebookMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-facebook text-white",
        className
      )}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-[68%]" focusable="false">
        <path d="M13.62 21v-7.2h2.42l.36-2.8h-2.78V9.21c0-.81.23-1.36 1.39-1.36h1.48V5.35c-.26-.03-1.14-.11-2.16-.11-2.14 0-3.6 1.3-3.6 3.7V11H8.3v2.8h2.43V21h2.89Z" />
      </svg>
    </span>
  );
}
