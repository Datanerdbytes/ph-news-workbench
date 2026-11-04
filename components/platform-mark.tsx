import { cn } from "cn";

export type PlatformKind =
  | "facebook"
  | "instagram"
  | "youtube"
  | "tiktok"
  | "linkedin";

const TILE: Record<PlatformKind, string> = {
  facebook: "bg-facebook",
  instagram:
    "bg-[linear-gradient(135deg,#f9ce34_0%,#ee2a7b_55%,#6228d7_100%)]",
  youtube: "bg-youtube",
  tiktok: "bg-tiktok",
  linkedin: "bg-linkedin",
};

export function PlatformMark({
  platform,
  className,
}: {
  platform: PlatformKind;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid size-8 shrink-0 place-items-center rounded-lg text-white",
        TILE[platform],
        className
      )}
    >
      <Glyph platform={platform} />
    </span>
  );
}

function Glyph({ platform }: { platform: PlatformKind }) {
  switch (platform) {
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-[58%]">
          <path d="M13.62 21v-7.2h2.42l.36-2.8h-2.78V9.21c0-.81.23-1.36 1.39-1.36h1.48V5.35c-.26-.03-1.14-.11-2.16-.11-2.14 0-3.6 1.3-3.6 3.7V11H8.3v2.8h2.43V21h2.89Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          className="size-[58%]"
        >
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-[64%]">
          <path d="M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.28 5 12 5 12 5s-6.28 0-7.85.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.75 1.77C5.72 19 12 19 12 19s6.28 0 7.85-.43a2.5 2.5 0 0 0 1.75-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[58%]"
        >
          <path d="M14 4v9.6a3.4 3.4 0 1 1-2.9-3.36" />
          <path d="M14 4c.45 2.2 2 3.8 4.3 4.1" />
        </svg>
      );
    case "linkedin":
      return (
        <span className="text-[13px] font-bold leading-none tracking-tight">
          in
        </span>
      );
  }
}
