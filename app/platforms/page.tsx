"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Lock,
  Minus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { PlatformMark, type PlatformKind } from "@/components/platform-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFacebookConnection } from "@/components/facebook-connection";
import { useInstagramConnection } from "@/components/instagram-connection";
import { useYouTubeConnection } from "@/components/youtube-connection";
import { useTikTokConnection } from "@/components/tiktok-connection";
import { cn } from "cn";

type CardState =
  | "checking"
  | "live"
  | "ready"
  | "setup"
  | "unreachable"
  | "gated";

type CapabilityFlag = { label: string; on?: boolean };

type PlatformEntry = {
  platform: PlatformKind;
  name: string;
  family: string;
  blurb: string;
  capabilities: CapabilityFlag[];
  state: CardState;
  account: string | null;
  note: string;
  action: string;
  href?: string;
  connecting?: boolean;
  onAction?: () => void;
  title?: string;
};

const RAIL: Record<PlatformKind, string> = {
  facebook: "bg-facebook",
  instagram:
    "bg-[linear-gradient(90deg,#f9ce34_0%,#ee2a7b_55%,#6228d7_100%)]",
  youtube: "bg-youtube",
  tiktok: "bg-tiktok",
  linkedin: "bg-linkedin",
};

const STATE_LABEL: Record<CardState, string> = {
  checking: "Checking",
  live: "Connected",
  ready: "Not connected",
  setup: "Setup needed",
  unreachable: "Status unavailable",
  gated: "Awaiting access",
};

const STATE_PILL: Record<CardState, string> = {
  checking: "bg-surface-3 text-muted-foreground",
  live: "bg-success-soft text-success",
  ready: "bg-warning-soft text-warning",
  setup: "bg-surface-3 text-muted-foreground",
  unreachable: "bg-surface-3 text-muted-foreground",
  gated: "bg-surface-3 text-muted-foreground",
};

const NOTE_TONE: Record<CardState, string> = {
  checking: "text-muted-foreground",
  live: "text-secondary-foreground",
  ready: "text-secondary-foreground",
  setup: "text-warning",
  unreachable: "text-warning",
  gated: "text-muted-foreground",
};

const LINKEDIN: Omit<PlatformEntry, "state"> = {
  platform: "linkedin",
  name: "LinkedIn",
  family: "LinkedIn · Community Management",
  blurb:
    "Text and media updates to a company Page, published from the same queue.",
  capabilities: [
    { label: "Text", on: true },
    { label: "Photo", on: true },
    { label: "Video", on: true },
    { label: "Carousel" },
  ],
  account: null,
  note: "Blocked by Community Management API access.",
  action: "Connect LinkedIn",
  title: "Blocked by Community Management API access",
};

function joined(names: string[]): string {
  return names.join(" · ");
}

export default function PlatformsPage() {
  const facebook = useFacebookConnection();
  const instagram = useInstagramConnection();
  const youtube = useYouTubeConnection();
  const tiktok = useTikTokConnection();

  const entries: PlatformEntry[] = [
    {
      platform: "facebook",
      name: "Facebook",
      family: "Meta · Graph API v23.0",
      blurb:
        "Text and single-photo posts to a Page you manage, with Page-level reach and engagement.",
      capabilities: [
        { label: "Text", on: true },
        { label: "Single photo", on: true },
        { label: "Insights", on: true },
        { label: "Carousel" },
      ],
      state: facebook.loading
        ? "checking"
        : facebook.connected
          ? "live"
          : facebook.configured
            ? "ready"
            : "setup",
      account:
        facebook.connected && facebook.page
          ? `${facebook.page.name} · ${facebook.page.id}`
          : null,
      note: facebook.unreachable
        ? "Status unavailable — the server or database may be down."
        : facebook.connected
          ? "Connected through the Facebook Login for Business OAuth flow."
          : facebook.configured
            ? "Ready — sign in with the Facebook account that manages the Page."
            : "The workspace owner still needs to finish the Facebook app setup.",
      action: "Connect Facebook",
      href: "/post",
      connecting: facebook.connecting,
      onAction: facebook.connect,
      title: facebook.connected
        ? undefined
        : facebook.configured
          ? "Opens Facebook's OAuth screen"
          : "Facebook app setup is still pending",
    },
    {
      platform: "instagram",
      name: "Instagram",
      family: "Meta · Graph API v23.0",
      blurb:
        "Feed photos, carousels, and Reels published through the Instagram account linked to your Page.",
      capabilities: [
        { label: "Feed photo", on: true },
        { label: "Carousel", on: true },
        { label: "Reels", on: true },
        { label: "Stories" },
      ],
      state: instagram.loading
        ? "checking"
        : instagram.connected
          ? "live"
          : instagram.configured
            ? "ready"
            : "setup",
      account: instagram.connected
        ? `@${instagram.ig?.username ?? "instagram"}${
            instagram.pageId ? ` · Page ${instagram.pageId}` : ""
          }`
        : null,
      note: instagram.unreachable
        ? "Status unavailable — the server or database may be down."
        : instagram.connected
          ? "Rides the same Meta login as the Facebook Page."
          : instagram.configured
            ? instagram.reason === "no_ig_account"
              ? "No professional Instagram account is linked to the Page yet."
              : "Ready — sign in through the Facebook Page that owns the account."
            : "Instagram uses the same Meta app credentials as Facebook.",
      action: "Connect Instagram",
      href: "/instagram",
      connecting: instagram.connecting,
      onAction: instagram.connect,
      title: instagram.connected
        ? undefined
        : instagram.configured
          ? "Opens the Meta OAuth screen"
          : "Facebook app setup is still pending",
    },
    {
      platform: "youtube",
      name: "YouTube",
      family: "Google · YouTube Data API",
      blurb:
        "Long-form video uploads with a title, description, and scheduled publish time.",
      capabilities: [
        { label: "Video", on: true },
        { label: "Scheduled publish", on: true },
        { label: "Text post" },
      ],
      state: youtube.loading
        ? "checking"
        : youtube.connected
          ? "live"
          : youtube.configured
            ? "ready"
            : "setup",
      account: youtube.connected
        ? `${youtube.account?.name ?? "YouTube"} · ${youtube.account?.id ?? ""}`
        : null,
      note: youtube.unreachable
        ? "Status unavailable — the server or database may be down."
        : youtube.connected
          ? "Uploads land on this channel with the granted youtube.upload scope."
          : youtube.configured
            ? "Ready — sign in with a Google account that owns the channel."
            : "The workspace owner still needs to finish the YouTube app setup.",
      action: "Connect YouTube",
      href: "/youtube",
      connecting: youtube.connecting,
      onAction: youtube.connect,
      title: youtube.connected
        ? undefined
        : youtube.configured
          ? "Opens Google's OAuth screen"
          : "YouTube app setup is still pending",
    },
    {
      platform: "tiktok",
      name: "TikTok",
      family: "TikTok · Content Posting API",
      blurb:
        "Video and photo posts to a TikTok business account, reviewed as drafts inside the app.",
      capabilities: [
        { label: "Video", on: true },
        { label: "Photo", on: true },
        { label: "Draft review", on: true },
        { label: "Text post" },
      ],
      state: tiktok.loading
        ? "checking"
        : tiktok.connected
          ? "live"
          : tiktok.configured
            ? "ready"
            : "setup",
      account: tiktok.connected
        ? `@${tiktok.account?.name ?? "tiktok"} · ${tiktok.account?.id ?? ""}`
        : null,
      note: tiktok.unreachable
        ? "Status unavailable — the server or database may be down."
        : tiktok.connected
          ? tiktok.publicPostingApproved
            ? "Connected with public posting approved."
            : "Connected, but public posting waits on the Content Posting API audit."
          : tiktok.configured
            ? "Ready — sign in with the TikTok business account to publish from."
            : "The workspace owner still needs to finish the TikTok app setup.",
      action: "Connect TikTok",
      href: "/tiktok",
      connecting: tiktok.connecting,
      onAction: tiktok.connect,
      title: tiktok.connected
        ? undefined
        : tiktok.configured
          ? "Opens TikTok's OAuth screen"
          : "TikTok app setup is still pending",
    },
    { ...LINKEDIN, state: "gated" },
  ];

  const checking = entries.some((entry) => entry.state === "checking");
  const liveEntries = entries.filter((entry) => entry.state === "live");
  const readyEntries = entries.filter((entry) => entry.state === "ready");
  const pendingEntries = entries.filter(
    (entry) => entry.state === "setup" || entry.state === "gated"
  );

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-brand">
              Channels
            </p>
            <h1 className="page-title mt-1.5">Platforms</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              Every network the workbench can publish to. Sign in once per
              platform and the desk keeps the connection for this workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
              <RefreshCw className="size-3.5 text-faint" aria-hidden />
              Live status · refreshes on navigation
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" aria-hidden />
              Tokens stored server-side
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <Summary
            label="Connected"
            value={checking ? "—" : liveEntries.length}
            hint={
              checking
                ? "Checking status"
                : joined(liveEntries.map((entry) => entry.name)) || "None yet"
            }
          />
          <Summary
            label="Ready to sign in"
            value={checking ? "—" : readyEntries.length}
            hint={
              checking
                ? "Checking status"
                : joined(readyEntries.map((entry) => entry.name)) ||
                  "Nothing waiting"
            }
          />
          <Summary
            label="Needs access"
            value={checking ? "—" : pendingEntries.length}
            hint={
              checking
                ? "Checking status"
                : joined(pendingEntries.map((entry) => entry.name)) ||
                  "Everything is configured"
            }
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <PlatformCard key={entry.platform} entry={entry} />
          ))}
        </div>

        <section className="panel mt-4 flex flex-wrap items-center gap-3 px-4 py-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-faint">
            <Lock className="size-4" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">
            Each sign-in opens that network&apos;s own OAuth screen and returns
            here. The workbench only stores the returned tokens, scoped to this
            workspace.
          </p>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:text-brand-strong"
          >
            Per-channel capability matrix
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </section>
      </div>
    </AppFrame>
  );
}

function PlatformCard({ entry }: { entry: PlatformEntry }) {
  const actionable = entry.state === "live" || entry.state === "ready";

  return (
    <article className="panel relative flex flex-col overflow-hidden">
      <span
        className={cn("absolute inset-x-0 top-0 h-[3px]", RAIL[entry.platform])}
        aria-hidden
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <PlatformMark
            platform={entry.platform}
            className="size-10 rounded-[11px]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[13.5px] font-semibold">{entry.name}</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                  STATE_PILL[entry.state]
                )}
              >
                {STATE_LABEL[entry.state]}
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              {entry.family}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          {entry.blurb}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.capabilities.map((capability) => (
            <span
              key={capability.label}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-medium",
                capability.on
                  ? "border-success/25 bg-success-soft text-success"
                  : "border-border bg-surface-2 text-muted-foreground"
              )}
            >
              {capability.on ? (
                <Check className="size-3" aria-hidden />
              ) : (
                <Minus className="size-3" aria-hidden />
              )}
              {capability.label}
            </span>
          ))}
        </div>

        <div className="mt-3 rounded-[8px] border border-border bg-surface-2 px-2.5 py-2">
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {entry.account ? "Account" : "Access"}
            </span>
            <span
              className={cn(
                "text-right text-[10.5px] leading-snug",
                entry.account ? "font-mono" : "font-medium",
                NOTE_TONE[entry.state]
              )}
            >
              {entry.account ?? entry.note}
            </span>
          </div>
        </div>

        <div className="mt-auto pt-3.5">
          {entry.state === "live" ? (
            <Link
              href={entry.href ?? "/accounts"}
              aria-label={`Launch ${entry.name}`}
              className={cn(
                buttonVariants({ variant: "brand", size: "sm" }),
                "h-8 w-full rounded-[7px] text-[11.5px]"
              )}
            >
              Launch
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <Button
              variant={entry.state === "ready" ? "brand" : "outline"}
              size="sm"
              onClick={entry.onAction}
              disabled={!actionable || !entry.onAction || entry.connecting}
              title={
                entry.title ??
                (entry.state === "checking"
                  ? "Checking this platform's status"
                  : undefined)
              }
              className="h-8 w-full rounded-[7px] text-[11.5px]"
            >
              {entry.connecting
                ? "Redirecting…"
                : entry.state === "checking"
                  ? "Checking…"
                  : entry.action}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Summary({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <article className="panel p-3.5">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-heading text-[26px] leading-none tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 truncate text-[10.5px] text-muted-foreground">
        {hint}
      </p>
    </article>
  );
}
