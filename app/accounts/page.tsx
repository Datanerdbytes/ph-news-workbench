"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Minus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { PlatformMark, type PlatformKind } from "@/components/platform-mark";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useFacebookConnection } from "@/components/facebook-connection";
import { useInstagramConnection } from "@/components/instagram-connection";
import { cn } from "cn";

type CapabilityFlag = { label: string; on?: boolean };

type Channel = {
  platform: PlatformKind;
  name: string;
  family: string;
  gate: string;
  summary: string;
  requirements: string[];
  capabilities: CapabilityFlag[];
  note: string;
};

const DESIGNED: Channel[] = [
  {
    platform: "youtube",
    name: "YouTube",
    family: "Google · YouTube Data API",
    gate: "Google verification",
    summary:
      "Upload video posts with a title, description, and scheduled publish time.",
    requirements: [
      "Google OAuth consent screen verification",
      "youtube.upload scope",
      "10,000 quota units a day is roughly six uploads",
    ],
    capabilities: [
      { label: "Text posts" },
      { label: "Single photo" },
      { label: "Video", on: true },
      { label: "Carousel" },
      { label: "Scheduled publishing", on: true },
    ],
    note: "Every upload needs a video file, so the composer blocks text-only drafts before they reach Google.",
  },
  {
    platform: "tiktok",
    name: "TikTok",
    family: "TikTok · Content Posting API",
    gate: "Content Posting audit",
    summary:
      "Send video or photo posts to a TikTok business account, with drafts reviewed in the app.",
    requirements: [
      "Content Posting API audit approval",
      "video.publish or photo.publish scope",
      "Media is required for every post",
    ],
    capabilities: [
      { label: "Text posts" },
      { label: "Single photo", on: true },
      { label: "Video", on: true },
      { label: "Carousel" },
      { label: "Draft review", on: true },
    ],
    note: "Posts arrive as drafts inside TikTok, so the composer shows the draft step rather than promising an instant publish.",
  },
  {
    platform: "linkedin",
    name: "LinkedIn",
    family: "LinkedIn · Community Management",
    gate: "Community API access",
    summary:
      "Publish text and media updates to a company Page from the same queue.",
    requirements: [
      "Community Management API approval",
      "Company Page admin role",
      "w_organization_social scope",
    ],
    capabilities: [
      { label: "Text posts", on: true },
      { label: "Single photo", on: true },
      { label: "Video", on: true },
      { label: "Carousel" },
      { label: "Scheduled publishing" },
    ],
    note: "Rights come from the company Page admin role, so drafts inherit the Page's audience and permissions.",
  },
];

const CAPABILITIES = [
  {
    channel: "Facebook",
    text: true,
    photo: true,
    video: false,
    media: false,
    gate: "Live",
  },
  {
    channel: "Instagram",
    text: false,
    photo: true,
    video: true,
    media: true,
    gate: "App Review",
  },
  {
    channel: "YouTube",
    text: false,
    photo: false,
    video: true,
    media: true,
    gate: "Verification",
  },
  {
    channel: "TikTok",
    text: false,
    photo: true,
    video: true,
    media: true,
    gate: "API audit",
  },
  {
    channel: "LinkedIn",
    text: true,
    photo: true,
    video: true,
    media: false,
    gate: "API access",
  },
];

export default function AccountsPage() {
  const connection = useFacebookConnection();
  const instagram = useInstagramConnection();
  const granted = connection.scopes ?? [];

  const liveChannels =
    connection.loading || instagram.loading
      ? null
      : (connection.connected ? 1 : 0) + (instagram.connected ? 1 : 0);

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-brand">
              Channels
            </p>
            <h1 className="page-title mt-1.5">Accounts</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              Connect where you publish. Facebook and Instagram are live today;
              the other channels are designed and waiting on platform access.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" aria-hidden />
              Tokens stored server-side
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <Summary
            label="Live channels"
            value={liveChannels ?? "—"}
            hint={liveChannels === null ? "Checking status" : "Facebook + Instagram"}
          />
          <Summary label="Designed" value={DESIGNED.length} hint="Queued by review" />
          <Summary
            label="Review gates"
            value={DESIGNED.length}
            hint="One per network"
          />
        </div>

        <section className="panel mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5">
            <PlatformMark platform="facebook" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[13px] font-semibold">Facebook</h2>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                    connection.connected
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning"
                  )}
                >
                  {connection.loading
                    ? "Checking"
                    : connection.connected
                      ? "Live"
                      : "Not connected"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Facebook Page · Graph API v23.0
              </p>
            </div>

            {connection.connected ? (
              <ConfirmButton
                variant="outline"
                size="sm"
                onConfirm={() => connection.disconnect()}
                disabled={connection.refreshing}
                confirmLabel="Confirm disconnect"
                busyLabel="Disconnecting…"
                className="h-8 rounded-[7px] bg-card px-3 text-[11.5px]"
              >
                Disconnect
              </ConfirmButton>
            ) : (
              <Button
                variant="facebook"
                size="sm"
                onClick={connection.connect}
                disabled={connection.loading}
                className="h-8 rounded-[7px] px-3 text-[11.5px]"
              >
                {connection.loading ? "Checking…" : "Connect Page"}
              </Button>
            )}
          </div>

          <div className="grid gap-5 px-4 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                Connection
              </p>
              {connection.loading ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Checking the Page connection…
                </p>
              ) : connection.unreachable ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Status unavailable. The dev server or database may be down.
                </p>
              ) : connection.connected ? (
                <div className="mt-2">
                  <p className="font-heading text-[19px] leading-tight">
                    {connection.page?.name}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Page ID{" "}
                    <span className="font-mono text-[10.5px]">
                      {connection.page?.id}
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {granted.length ? (
                      granted.map((scope) => (
                        <span
                          key={scope}
                          className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                        >
                          {scope}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Scopes are not reported for this connection.
                      </span>
                    )}
                  </div>
                </div>
              ) : !connection.configured ? (
                <div className="mt-2">
                  <p className="text-[12px] font-medium">
                    Facebook app credentials are missing
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to{" "}
                    <span className="font-mono text-[10.5px]">.env.local</span>,
                    then restart the dev server.
                  </p>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-[12px] font-medium">
                    No Page connected yet
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Connect a Page you manage to draft with its voice and
                    publish to it.
                  </p>
                  <Button
                    variant="facebook"
                    size="sm"
                    onClick={connection.connect}
                    className="mt-3 h-8 rounded-[7px] px-3 text-[11.5px]"
                  >
                    Connect Facebook Page
                  </Button>
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                What the adapter supports
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Capability label="Text posts" on />
                <Capability label="Single photo" on />
                <Capability label="Carousel" />
                <Capability label="Video" />
                <Capability label="Scheduled publishing" />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Composer fields follow these capabilities, so the app never
                offers a control the network cannot honour.
              </p>
            </div>
          </div>
        </section>

        <section className="panel mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5">
            <PlatformMark platform="instagram" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[13px] font-semibold">Instagram</h2>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                    instagram.connected
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning"
                  )}
                >
                  {instagram.loading
                    ? "Checking"
                    : instagram.connected
                      ? "Live"
                      : "Not connected"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Instagram Business · Graph API v23.0 · via the Facebook Page
              </p>
            </div>

            <Button
              variant={instagram.connected ? "outline" : "brand"}
              size="sm"
              onClick={instagram.connect}
              disabled={instagram.loading}
              className={cn(
                "h-8 rounded-[7px] px-3 text-[11.5px]",
                instagram.connected && "bg-card"
              )}
            >
              {instagram.loading
                ? "Checking…"
                : instagram.connected
                  ? "Reconnect"
                  : "Connect Instagram"}
            </Button>
          </div>

          <div className="grid gap-5 px-4 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                Connection
              </p>
              {instagram.loading ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Checking the Instagram linkage…
                </p>
              ) : instagram.unreachable ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Status unavailable. The dev server or database may be down.
                </p>
              ) : instagram.connected ? (
                <div className="mt-2">
                  <p className="font-heading text-[19px] leading-tight">
                    @{instagram.ig?.username}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Instagram ID{" "}
                    <span className="font-mono text-[10.5px]">
                      {instagram.ig?.id}
                    </span>
                    {instagram.pageId ? (
                      <>
                        {" · "}Page{" "}
                        <span className="font-mono text-[10.5px]">
                          {instagram.pageId}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {instagram.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <Link
                    href="/instagram"
                    className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:text-brand-strong"
                  >
                    Open Instagram studio
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              ) : !instagram.configured ? (
                <div className="mt-2">
                  <p className="text-[12px] font-medium">
                    Facebook app credentials are missing
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Instagram rides the same Meta app. Add FACEBOOK_APP_ID and
                    FACEBOOK_APP_SECRET to{" "}
                    <span className="font-mono text-[10.5px]">.env.local</span>,
                    then restart the dev server.
                  </p>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-[12px] font-medium">
                    {instagram.reason === "no_ig_account"
                      ? "No Instagram account linked to the Page"
                      : instagram.reason === "scope_missing"
                        ? "Instagram permissions are missing"
                        : instagram.reason === "probe_failed"
                          ? "Instagram could not be verified"
                          : "Not connected yet"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {instagram.reason === "scope_missing" && instagram.detail
                      ? `Reconnect to grant ${instagram.detail}.`
                      : instagram.reason === "probe_failed" && instagram.detail
                        ? instagram.detail
                        : instagram.detail ??
                          "Connect a Page you manage, then link its professional Instagram account under Page settings → Linked accounts."}
                  </p>
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={instagram.connect}
                    className="mt-3 h-8 rounded-[7px] px-3 text-[11.5px]"
                  >
                    Connect Instagram
                  </Button>
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                What the adapter supports
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Capability label="Feed photo" on />
                <Capability label="Carousel" on />
                <Capability label="Video / Reels" on />
                <Capability label="Text-only post" />
                <Capability label="Scheduled publishing" />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Every post needs at least one image or video, so the composer
                blocks text-only drafts before they reach Meta.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold">Designed and gated</h2>
          <span className="text-[10.5px] text-muted-foreground">
            No channel connects before its review clears
          </span>
        </div>

        {DESIGNED.map((channel) => (
          <section
            key={channel.platform}
            className="panel mt-4 overflow-hidden"
            aria-labelledby={`channel-${channel.platform}`}
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5">
              <PlatformMark platform={channel.platform} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id={`channel-${channel.platform}`}
                    className="text-[13px] font-semibold"
                  >
                    {channel.name}
                  </h2>
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-warning">
                    Not connected
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {channel.family}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled
                title={`Blocked by ${channel.gate}`}
                className="h-8 rounded-[7px] bg-card px-3 text-[11.5px]"
              >
                Connect {channel.name}
              </Button>
            </div>

            <div className="grid gap-5 px-4 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                  Connection
                </p>
                <div className="mt-2">
                  <p className="text-[12px] font-medium">
                    Blocked by {channel.gate}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {channel.summary}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {channel.requirements.map((requirement) => (
                      <li
                        key={requirement}
                        className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                      >
                        {requirement}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                  What the adapter supports
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {channel.capabilities.map((capability) => (
                    <Capability
                      key={capability.label}
                      label={capability.label}
                      on={capability.on}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {channel.note}
                </p>
              </div>
            </div>
          </section>
        ))}

        <section className="panel mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-[12.5px] font-semibold">
              What each channel supports
            </h2>
            <span className="text-[10.5px] text-muted-foreground">
              Capability matrix
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {["Channel", "Text", "Photo", "Video", "Needs media", "Gate"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((row) => {
                  const gate =
                    row.channel === "Instagram"
                      ? instagram.loading
                        ? "Checking"
                        : instagram.connected
                          ? "Live"
                          : "App Review"
                      : row.gate;

                  return (
                    <tr
                      key={row.channel}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-2.5 text-[11.5px] font-semibold">
                        {row.channel}
                      </td>
                      <Flag on={row.text} />
                      <Flag on={row.photo} />
                      <Flag on={row.video} />
                      <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                        {row.media ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                            gate === "Live"
                              ? "bg-success-soft text-success"
                              : "bg-surface-3 text-muted-foreground"
                          )}
                        >
                          {gate}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Authorize per workspace",
              body: "Each workspace stores its own encrypted tokens, so one customer's Page never leaks into another's queue.",
            },
            {
              step: "02",
              title: "Adapt, don't special-case",
              body: "Every channel implements connect, publish, schedule, and insights behind the same adapter contract.",
            },
            {
              step: "03",
              title: "One queue, normalized metrics",
              body: "Scheduled posts fan out to channel targets; insights return as comparable impressions, reach, and engagement.",
            },
          ].map((item) => (
            <article key={item.step} className="panel p-4">
              <span className="font-mono text-[10px] font-semibold text-brand">
                {item.step}
              </span>
              <h3 className="mt-1.5 text-[12px] font-semibold">{item.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </article>
          ))}
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <RefreshCw className="size-3.5 text-faint" aria-hidden />
          Connection status refreshes when you move between pages.
          <Link
            href="/dashboard"
            className="ml-auto inline-flex items-center gap-1 font-semibold text-brand hover:text-brand-strong"
          >
            Back to dashboard
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </AppFrame>
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
      <p className="mt-1.5 text-[10.5px] text-muted-foreground">{hint}</p>
    </article>
  );
}

function Capability({ label, on }: { label: string; on?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-medium",
        on
          ? "border-success/25 bg-success-soft text-success"
          : "border-border bg-surface-2 text-muted-foreground"
      )}
    >
      {on ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <Minus className="size-3" aria-hidden />
      )}
      {label}
    </span>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <td className="px-4 py-2.5">
      {on ? (
        <Check className="size-3.5 text-success" aria-label="Supported" />
      ) : (
        <Minus className="size-3.5 text-faint" aria-label="Not supported" />
      )}
    </td>
  );
}
