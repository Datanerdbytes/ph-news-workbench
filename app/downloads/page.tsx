"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  Clipboard,
  Clock3,
  Download,
  FolderOpen,
  HardDriveDownload,
  Link2,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Video,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

type PlatformId = "youtube" | "facebook" | "instagram" | "x" | "reddit" | "tiktok";

type Platform = {
  id: PlatformId;
  name: string;
  domains: string[];
  mark: string;
  markClass: string;
};

type DownloadRecord = {
  id: string;
  platform: string;
  quality: string;
  status:
    | "queued"
    | "fetching"
    | "downloading"
    | "finalizing"
    | "done"
    | "failed";
  progress: number | null;
  statusMessage: string;
  fileName: string | null;
  saveLocation: string | null;
  source?: "cloud" | "disk";
  error: string | null;
  createdAt: number;
};

const PLATFORMS: Platform[] = [
  {
    id: "youtube",
    name: "YouTube",
    domains: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    mark: "▶",
    markClass: "bg-[#fce9e7] text-[#c82720]",
  },
  {
    id: "facebook",
    name: "Facebook",
    domains: ["facebook.com", "fb.watch", "m.facebook.com"],
    mark: "f",
    markClass: "bg-[#eaf1fc] text-[#1877f2]",
  },
  {
    id: "instagram",
    name: "Instagram",
    domains: ["instagram.com", "instagr.am"],
    mark: "◎",
    markClass: "bg-[linear-gradient(135deg,#fff1ce,#fce0eb_55%,#e9e3ff)] text-[#b83280]",
  },
  {
    id: "x",
    name: "X",
    domains: ["x.com", "twitter.com", "t.co"],
    mark: "𝕏",
    markClass: "bg-[#edf0f2] text-[#171a1d]",
  },
  {
    id: "reddit",
    name: "Reddit",
    domains: ["reddit.com", "redd.it", "v.redd.it"],
    mark: "●",
    markClass: "bg-[#fff0e9] text-[#f04b19]",
  },
  {
    id: "tiktok",
    name: "TikTok",
    domains: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
    mark: "♪",
    markClass: "bg-[#e9f8f8] text-[#171a1d]",
  },
];

function platformFromUrl(value: string): Platform | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return (
      PLATFORMS.find((platform) =>
        platform.domains.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
        )
      ) ?? null
    );
  } catch {
    return null;
  }
}

function elapsedTime(createdAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return `${seconds}s elapsed`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`;
}

function PlatformMark({ platform }: { platform: Platform }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl text-lg font-bold",
        platform.markClass,
        platform.id === "youtube" && "text-[13px]"
      )}
      aria-hidden="true"
    >
      {platform.mark}
    </span>
  );
}

function Step({
  number,
  title,
  description,
  last = false,
}: {
  number: string;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div className="relative flex gap-3.5">
      {!last && (
        <span
          aria-hidden="true"
          className="absolute left-[15px] top-8 h-[calc(100%-12px)] w-px bg-white/10"
        />
      )}
      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.07] font-mono text-[11px] text-white/65">
        {number}
      </span>
      <div className="pb-5">
        <p className="text-[13px] font-semibold text-white/90">{title}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function DownloadsPage() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState("best");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewErrorId, setPreviewErrorId] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const detectedPlatform = useMemo(() => platformFromUrl(url), [url]);
  const previewJob = useMemo(
    () =>
      downloads.find(
        (job) => job.id === previewId && job.status === "done" && job.fileName
      ) ?? null,
    [downloads, previewId]
  );

  useEffect(() => {
    let active = true;
    fetch("/api/downloads", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error ?? "Could not load recent downloads.");
        }
        if (active) {
          const jobs = (data.jobs ?? []) as DownloadRecord[];
          setDownloads(jobs);
          const running = jobs.find(
            (job) =>
              job.status === "queued" ||
              job.status === "fetching" ||
              job.status === "downloading" ||
              job.status === "finalizing"
          );
          if (running) setActiveJobId(running.id);
          const latestDone = jobs.find(
            (job) => job.status === "done" && job.fileName
          );
          if (latestDone) setPreviewId(latestDone.id);
        }
      })
      .catch((error) => {
        if (active) {
          toast.error("Could not load recent downloads", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let notified = false;

    async function poll() {
      try {
        const response = await fetch(`/api/downloads/${activeJobId}`, {
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error ?? "Could not check the download status.");
        }
        if (cancelled) return;

        const job = data.job as DownloadRecord;
        setDownloads((current) => [
          job,
          ...current.filter((item) => item.id !== job.id),
        ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20));
        if (job.status === "done") {
          if (!notified) {
            toast.success("Video ready in your cloud library", {
              description: job.fileName ?? undefined,
            });
            notified = true;
          }
          setPreviewId(job.id);
          setActiveJobId(null);
          return;
        }
        if (job.status === "failed") {
          toast.error("Video download failed", {
            description: job.error ?? "yt-dlp could not download this video.",
          });
          setActiveJobId(null);
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!cancelled) {
          toast.error("Could not check download progress", {
            description: error instanceof Error ? error.message : undefined,
          });
          setActiveJobId(null);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId]);

  async function pasteLink() {
    urlInputRef.current?.focus();
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard reading is not available in this browser.");
      }
      const value = await navigator.clipboard.readText();
      if (!value) {
        toast.info("Your clipboard is empty.");
        return;
      }
      setUrl(value.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.info("Paste from your keyboard", {
        description: "The link field is focused. Press ⌘V on Mac or Ctrl+V on Windows.",
      });
    }
  }

  async function requestDownload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      toast.error("Add a video link to continue.");
      return;
    }
    if (!detectedPlatform) {
      toast.error("That link doesn’t look like a supported video URL.", {
        description: "Try a YouTube, Facebook, Instagram, X, Reddit, or TikTok link.",
      });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), quality }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not start the video download.");
      }
      const job = data.job as DownloadRecord;
      setDownloads((current) => [
        job,
        ...current.filter((item) => item.id !== job.id),
      ].slice(0, 20));
      setActiveJobId(job.id);
      toast.info(`${job.platform} download queued`, {
        description:
          "The local downloader picks it up, then syncs the video to your cloud library.",
      });
    } catch (error) {
      toast.error("Could not start the download", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeDownload(id: string) {
    try {
      const response = await fetch(`/api/downloads/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not remove this download record.");
      }
      const remaining = downloads.filter((job) => job.id !== id);
      setDownloads(remaining);
      if (previewId === id) {
        const next = remaining.find(
          (job) => job.status === "done" && job.fileName
        );
        setPreviewId(next?.id ?? null);
      }
    } catch (error) {
      toast.error("Could not remove download history", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const activeDownload = downloads.find((job) => job.id === activeJobId);

  return (
    <AppFrame>
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 lg:pb-12 lg:pt-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-brand">
              <span className="grid size-6 place-items-center rounded-lg bg-brand-soft">
                <WandSparkles className="size-3.5" aria-hidden="true" />
              </span>
              Creator tools
            </div>
            <h1 className="page-title text-[2rem] sm:text-[2.25rem]">
              Video downloads
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Keep the videos you love close by. Paste a link, choose a quality,
              and save it to your library.
            </p>
          </div>
          <a
            href="#how-it-works"
            className="mb-0.5 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[11.5px] font-semibold text-secondary-foreground shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <CircleHelp className="size-3.5 text-muted-foreground" aria-hidden="true" />
            How it works
          </a>
        </header>

        <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(330px,0.78fr)]">
          <div className="panel overflow-hidden">
            <div className="relative isolate overflow-hidden border-b border-border bg-[linear-gradient(115deg,#fafbfc_0%,#fff_55%,#f6f7fb_100%)] px-5 py-5 sm:px-7 sm:py-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-20 -z-10 size-64 rounded-full border border-brand/10"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-1 top-[-54px] -z-10 size-44 rounded-full border border-brand/10"
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-white/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-brand-strong">
                    <Sparkles className="size-3" aria-hidden="true" />
                    Simple by design
                  </div>
                  <h2 className="mt-3 max-w-lg font-heading text-[1.65rem] font-medium leading-[1.08] tracking-[-0.025em] text-ink sm:text-[1.95rem]">
                    A link is all
                    <br className="hidden sm:block" /> you need.
                  </h2>
                </div>
                <div className="hidden size-[76px] rotate-[-8deg] place-items-center rounded-[22px] border border-white bg-white/75 text-brand shadow-[0_12px_30px_-18px_rgba(27,30,39,.32)] sm:grid">
                  <ArrowDownToLine className="size-8 stroke-[1.5]" aria-hidden="true" />
                </div>
              </div>
              <p className="mt-2 max-w-[440px] text-[12px] leading-relaxed text-muted-foreground">
                We’ll recognize the source automatically and prepare a clean
                video file for your library.
              </p>
            </div>

            <form onSubmit={requestDownload} className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="video-url"
                    className="text-[11px] font-bold uppercase tracking-[0.12em] text-secondary-foreground"
                  >
                    Video link
                  </label>
                  {detectedPlatform ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-1 text-[10px] font-semibold text-success">
                      <Check className="size-3" aria-hidden="true" />
                      {detectedPlatform.name} detected
                    </span>
                  ) : url.trim() ? (
                    <span className="text-[10px] font-medium text-warning">
                      Unsupported source
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Public video links
                    </span>
                  )}
                </div>
                <div className="group flex min-h-[58px] items-center gap-2 rounded-xl border border-input bg-card p-1.5 transition-all focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10">
                  <Link2
                    className="ml-2 size-4 shrink-0 text-muted-foreground/75 transition-colors group-focus-within:text-brand"
                    aria-hidden="true"
                  />
                  <input
                    id="video-url"
                    ref={urlInputRef}
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://youtu.be/…"
                    autoComplete="url"
                    className="h-10 min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/55 focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={() => void pasteLink()}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-[10.5px] font-semibold text-secondary-foreground transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-success" aria-hidden="true" />
                    ) : (
                      <Clipboard className="size-3.5" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">{copied ? "Pasted" : "Paste"}</span>
                  </button>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <LockKeyhole className="size-3" aria-hidden="true" />
                  The downloader worker on your Mac saves the file, then syncs a
                  copy to this workspace’s cloud library.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <label
                    htmlFor="video-quality"
                    className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-secondary-foreground"
                  >
                    Video quality
                  </label>
                  <div className="relative">
                    <select
                      id="video-quality"
                      value={quality}
                      onChange={(event) => setQuality(event.target.value)}
                      className="h-11 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-[12px] font-medium text-foreground outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                    >
                      <option value="best">Best available</option>
                      <option value="1080">Up to 1080p</option>
                      <option value="720">Up to 720p</option>
                      <option value="480">Up to 480p</option>
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <div>
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-secondary-foreground">
                    File type
                  </span>
                  <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3">
                    <Video className="size-3.5 text-brand" aria-hidden="true" />
                    <span className="text-[12px] font-semibold text-foreground">Video</span>
                    <span className="ml-auto rounded bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-muted-foreground shadow-sm">
                      MP4
                    </span>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                variant="brand"
                disabled={busy || Boolean(activeJobId)}
                aria-busy={busy || Boolean(activeJobId)}
                className="h-11 w-full rounded-lg text-[12px] font-semibold"
              >
                {busy || activeJobId ? (
                  <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowDownToLine className="size-4" aria-hidden="true" />
                )}
                {busy
                  ? "Starting download…"
                  : activeDownload?.statusMessage ?? "Download video"}
                <ArrowRight className="ml-auto size-4 opacity-75" aria-hidden="true" />
              </Button>

              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                Download videos only when you have permission to save or reuse them.
              </p>
            </form>

            {activeDownload && (
              <div
                className="mx-5 mb-5 rounded-xl border border-brand/15 bg-brand-soft/40 p-3.5 sm:mx-7 sm:mb-6"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[11px] font-semibold text-foreground">
                    {activeDownload.statusMessage ||
                      (activeDownload.status === "queued"
                        ? "Starting download…"
                        : `Downloading from ${activeDownload.platform}`)}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-brand">
                    {activeDownload.progress === null
                      ? activeDownload.status === "finalizing"
                        ? "Finishing"
                        : "Working…"
                      : `${activeDownload.progress}%`}
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"
                  role="progressbar"
                  aria-label="Video download progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={activeDownload.progress ?? undefined}
                  aria-valuetext={
                    activeDownload.progress === null
                      ? activeDownload.statusMessage
                      : `${activeDownload.progress}%`
                  }
                >
                  <div
                    className={cn(
                      "h-full rounded-full bg-brand transition-[width] duration-500",
                      activeDownload.progress === null &&
                        "w-1/3 animate-[download-sweep_1.2s_ease-in-out_infinite]"
                    )}
                    style={
                      activeDownload.progress === null
                        ? undefined
                        : { width: `${activeDownload.progress}%` }
                    }
                  />
                </div>
                <p className="mt-2 truncate text-[9.5px] text-muted-foreground">
                  Saving to ~/Downloads/VideoDownloader/{activeDownload.platform}
                  {" · "}
                  {elapsedTime(activeDownload.createdAt)}
                </p>
                {activeDownload.status === "queued" && (
                  <p className="mt-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
                    Still queued? Install the auto-start worker on your Mac:{" "}
                    <code className="rounded bg-white px-1 py-0.5 font-mono text-[9px]">
                      npm run worker:install
                    </code>
                  </p>
                )}
              </div>
            )}
          </div>

          <aside
            id="how-it-works"
            className="relative isolate flex min-h-[380px] flex-col overflow-hidden rounded-xl bg-[#171923] p-5 text-white shadow-[0_12px_34px_-22px_rgba(16,24,40,.5)] sm:p-6"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-28 -z-10 size-[310px] rounded-full bg-[radial-gradient(circle,rgba(154,161,171,.25),transparent_68%)]"
            />
            {previewJob ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/65">
                    <span className="size-1.5 rounded-full bg-[#79d2ae]" />
                    Download complete
                  </span>
                  <span className="font-mono text-[9px] uppercase text-white/35">
                    {previewJob.platform} · {previewJob.quality}
                  </span>
                </div>

                <div className="relative mt-5 flex h-[280px] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black sm:h-[320px]">
                  {previewErrorId === previewJob.id ? (
                    <div className="flex flex-col items-center gap-1.5 px-6 text-center">
                      <TriangleAlert className="size-5 text-warning" aria-hidden="true" />
                      <p className="text-[11.5px] font-semibold text-white/80">
                        Preview unavailable
                      </p>
                      <p className="text-[10px] leading-relaxed text-white/45">
                        The file is no longer available. It may have been removed
                        from the cloud library or your Downloads folder.
                      </p>
                    </div>
                  ) : (
                    <video
                      key={previewJob.id}
                      src={`/api/downloads/${previewJob.id}/file`}
                      controls
                      playsInline
                      preload="metadata"
                      onError={() => setPreviewErrorId(previewJob.id)}
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>

                <div className="mt-4 min-w-0">
                  <p className="truncate text-[13px] font-semibold text-white/90">
                    {previewJob.fileName}
                  </p>
                  <p className="mt-1 truncate font-mono text-[9.5px] text-white/40">
                    {previewJob.source === "disk"
                      ? `Saved to ${previewJob.saveLocation}`
                      : "Synced to your cloud library"}
                  </p>
                </div>

                <div className="mt-auto pt-4">
                  <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/10 text-[#79d2ae]">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white/85">
                          Ready to watch
                        </p>
                        <p className="mt-0.5 truncate text-[9.5px] text-white/45">
                          {previewJob.source === "disk"
                            ? "Recovered from your Downloads folder"
                            : previewJob.quality === "best"
                              ? "Best available quality"
                              : `Up to ${previewJob.quality}p`}{" "}
                          · MP4 · {previewJob.source === "disk" ? "Local file" : "Cloud file"}
                        </p>
                      </div>
                      <a
                        href={`/reels?video=${previewJob.id}`}
                        aria-label={`Use ${previewJob.fileName} as a reel`}
                        title="Use as reel"
                        className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        <Clapperboard className="size-3.5" aria-hidden="true" />
                      </a>
                      <a
                        href={`/api/downloads/${previewJob.id}/file?download=1`}
                        aria-label={`Download ${previewJob.fileName}`}
                        title="Download the video file"
                        className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/65">
                <span className="size-1.5 rounded-full bg-white/70" />
                Cloud library
              </span>
              <span className="font-mono text-[9px] text-white/35">01 / 03</span>
            </div>

            <div className="relative mx-auto my-6 flex h-[112px] w-full max-w-[310px] items-center justify-center">
              <div className="absolute left-[12%] top-4 h-[76px] w-[56px] -rotate-[13deg] rounded-lg border border-white/10 bg-white/[0.04]" />
              <div className="absolute right-[12%] top-4 h-[76px] w-[56px] rotate-[13deg] rounded-lg border border-white/10 bg-white/[0.04]" />
              <div className="relative grid h-[104px] w-[76px] -rotate-2 place-items-center overflow-hidden rounded-xl border border-white/15 bg-[linear-gradient(155deg,#343b46,#252c3d_58%,#2c3540)] shadow-[0_14px_35px_-16px_rgba(0,0,0,.7)]">
                <div
                  aria-hidden="true"
                  className="absolute -right-4 -top-3 size-14 rounded-full border border-white/15"
                />
                <div className="grid size-9 place-items-center rounded-full border border-white/25 bg-white/10 backdrop-blur-sm">
                  <Play className="ml-0.5 size-3.5 fill-white text-white" aria-hidden="true" />
                </div>
                <span className="absolute bottom-2.5 left-2.5 rounded bg-black/25 px-1.5 py-0.5 font-mono text-[7px] font-bold tracking-wider text-white/80">
                  VIDEO
                </span>
              </div>
              <span className="absolute right-[23%] top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-white/10 text-white/85">
                <ArrowDown className="size-3.5" aria-hidden="true" />
              </span>
            </div>

            <div className="mb-5">
              <p className="font-heading text-[1.6rem] font-medium leading-tight tracking-[-0.02em]">
                From scroll
                <br />
                to saved.
              </p>
              <p className="mt-2 max-w-[310px] text-[11px] leading-relaxed text-white/50">
                The downloader on your Mac does the heavy lifting, then syncs
                the file to your workspace’s cloud library.
              </p>
            </div>

            <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.045] p-3.5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold text-white/80">
                  Your download flow
                </p>
                <span className="rounded-full bg-success/10 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[#79d2ae]">
                  yt-dlp ready
                </span>
              </div>
              <Step
                number="01"
                title="Paste a video link"
                description="We identify which platform it came from."
              />
              <Step
                number="02"
                title="Choose your quality"
                description="Pick the resolution that works for you."
              />
              <Step
                number="03"
                title="Save and sync"
                description="yt-dlp saves the MP4 on your Mac; the worker uploads it to your cloud library."
                last
              />
            </div>
              </>
            )}
          </aside>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold tracking-[-0.01em]">
                  One place for your favorite platforms
                </h2>
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  Paste a public video link from any of these sources.
                </p>
              </div>
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[9px] font-semibold text-muted-foreground">
                6 platforms
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {PLATFORMS.map((platform) => (
                <div
                  key={platform.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                    detectedPlatform?.id === platform.id
                      ? "border-brand/25 bg-brand-soft/60"
                      : "border-border bg-card hover:bg-surface-2"
                  )}
                >
                  <PlatformMark platform={platform} />
                  <span className="text-[10.5px] font-semibold text-secondary-foreground">
                    {platform.name}
                  </span>
                  {detectedPlatform?.id === platform.id && (
                    <Check
                      className="ml-auto size-3 text-brand"
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="panel flex items-center gap-3.5 p-4 sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[12px] font-bold">Your downloader, your library</h2>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                The worker on your Mac saves the file, then syncs a copy to this
                workspace so it’s ready on any device.
              </p>
            </div>
            <FolderOpen className="ml-auto size-4 shrink-0 text-faint" aria-hidden="true" />
          </div>
        </section>

        <section className="panel mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-secondary-foreground">
                <Clock3 className="size-3.5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-[12px] font-bold">Recent downloads</h2>
                <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                  Your download activity across devices
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
              <HardDriveDownload className="size-3.5" aria-hidden="true" />
            {downloads.length} {downloads.length === 1 ? "job" : "jobs"}
            </span>
          </div>
          {downloads.length ? (
            <ul className="divide-y divide-border">
            {downloads.map((job) => (
              <li
                key={job.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5",
                  previewJob?.id === job.id && "bg-brand-soft/40"
                )}
              >
                <PlatformMark
                  platform={
                    PLATFORMS.find((platform) => platform.name === job.platform) ??
                    PLATFORMS[0]
                  }
                />
                {job.status === "done" && job.fileName ? (
                  <button
                    type="button"
                    onClick={() => setPreviewId(job.id)}
                    aria-label={`Preview ${job.fileName} in the side panel`}
                    className="min-w-0 flex-1 cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <p className="truncate text-[11px] font-semibold text-foreground">
                      {job.fileName}
                    </p>
                    <p className="mt-1 truncate text-[9.5px] text-muted-foreground">
                      {job.saveLocation}
                    </p>
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-foreground">
                      {job.fileName ?? `${job.platform} video`}
                    </p>
                    <p className="mt-1 truncate text-[9.5px] text-muted-foreground">
                      {job.status === "done"
                        ? job.saveLocation
                        : job.status === "failed"
                          ? job.error
                          : job.statusMessage || "Waiting for the local downloader…"}
                    </p>
                  </div>
                )}
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold",
                    job.status === "done" && "bg-success-soft text-success",
                    job.status === "failed" && "bg-danger-soft text-destructive",
                    (job.status === "queued" ||
                      job.status === "fetching" ||
                      job.status === "downloading" ||
                      job.status === "finalizing") &&
                      "bg-info-soft text-info"
                  )}
                >
                  {job.status === "done" ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : job.status === "failed" ? (
                    <TriangleAlert className="size-3" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
                  )}
                  {job.status === "done"
                    ? "Saved"
                    : job.status === "failed"
                      ? "Failed"
                      : job.progress === null
                        ? "Working"
                        : `${job.progress}%`}
                </span>
                {job.status === "done" && (
                  <span className="hidden items-center gap-1 text-[9px] font-medium text-muted-foreground sm:inline-flex">
                    <Download className="size-3" aria-hidden="true" />
                    {job.source === "disk" ? "Local file" : "Cloud file"}
                  </span>
                )}
                {job.status === "done" && (
                  <a
                    href={`/reels?video=${job.id}`}
                    aria-label={`Use ${job.fileName ?? job.platform} as a reel`}
                    title="Use as reel"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Clapperboard className="size-3.5" aria-hidden="true" />
                  </a>
                )}
                {(job.status === "done" || job.status === "failed") &&
                  job.source !== "disk" && (
                  <button
                    type="button"
                    onClick={() => void removeDownload(job.id)}
                    aria-label={`Remove ${job.fileName ?? job.platform} from recent downloads`}
                    title="Remove from recent downloads"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-5 py-7 text-center">
            <span className="grid size-11 place-items-center rounded-2xl border border-dashed border-line-strong bg-surface-2 text-muted-foreground">
              <ArrowDownToLine className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-[11.5px] font-semibold text-secondary-foreground">
              Your saved videos will show up here
            </p>
            <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-muted-foreground">
              Start a download and it will appear here with its save location.
            </p>
            </div>
          )}
        </section>

        <footer className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9.5px] text-muted-foreground/80">
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole className="size-3" aria-hidden="true" />
            Local downloader, cloud library
          </span>
          <span aria-hidden="true" className="text-border">•</span>
          <span>Only download content you have permission to save.</span>
        </footer>
      </main>
    </AppFrame>
  );
}
