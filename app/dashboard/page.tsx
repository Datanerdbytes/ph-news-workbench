"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  FileText,
  Loader2,
  Newspaper,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app-frame";
import { FacebookMark } from "@/components/facebook-mark";
import { PlatformMark } from "@/components/platform-mark";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useFacebookConnection } from "@/components/facebook-connection";
import { TimeAgo } from "@/components/time-ago";
import { authClient } from "@/lib/auth-client";
import { cn } from "cn";
import { formatLongDate } from "@/lib/format";

type Draft = {
  id: number;
  status: string;
  news_title: string | null;
  created_at: string;
};

type Story = {
  id: number;
  title: string;
  status: string;
  created_at: string;
  draft_id: number | null;
};

type Activity = {
  id: string | number;
  type: "schedule" | "draft";
  event: string;
  source: string;
  displayTitle: string;
  displayTime: string;
  kind?: string | null;
  scheduleSource?: string | null;
  status?: string;
  facebookPostId?: string | null;
  errorMessage?: string | null;
  correlationId?: string;
  newsItemId?: number | null;
  scheduledPostId?: number | null;
  metadata?: Record<string, unknown> | null;
};

const PLANNED = [
  { platform: "instagram" as const, name: "Instagram", gate: "Meta App Review" },
  { platform: "youtube" as const, name: "YouTube", gate: "Google verification" },
  { platform: "tiktok" as const, name: "TikTok", gate: "Content Posting audit" },
  { platform: "linkedin" as const, name: "LinkedIn", gate: "Community API" },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function RetryButton({
  scheduledPostId,
  onSuccess,
}: {
  scheduledPostId: number;
  activityId: string | number;
  onSuccess: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleRetry() {
    setPending(true);
    try {
      const res = await fetch(`/api/schedule/${scheduledPostId}/retry`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retry failed");
      toast.success("Post queued for retry", {
        description: "The scheduler will pick it up shortly.",
      });
      onSuccess();
    } catch (error) {
      toast.error("Could not queue retry", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRetry}
      disabled={pending}
      aria-busy={pending}
      className="ml-2 h-7 rounded-[6px] px-2 text-[10.5px] border-muted-foreground/30 hover:bg-surface-2"
    >
      <RotateCcw className={`size-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden />
      <span className="ml-1">{pending ? "Retrying…" : "Retry"}</span>
    </Button>
  );
}

export default function DashboardPage() {
  const connection = useFacebookConnection();
  const { data: session } = authClient.useSession();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [draftsRes, itemsRes, activitiesRes] = await Promise.all([
        fetch("/api/drafts", { cache: "no-store" }),
        fetch("/api/items", { cache: "no-store" }),
        fetch("/api/activity?mergeByStory=false&dedupe=false&limit=10", { cache: "no-store" }),
      ]);

      if (!draftsRes.ok || !itemsRes.ok || !activitiesRes.ok) {
        throw new Error("Could not load the workspace.");
      }

      const draftData = (await draftsRes.json()) as Draft[];
      const storyData = (await itemsRes.json()) as
        | Story[]
        | { rows?: Story[] };
      const activityData = (await activitiesRes.json()) as
        | Activity[]
        | { rows?: Activity[]; nextCursor?: number | null; hasMore?: boolean };
      setDrafts(Array.isArray(draftData) ? draftData : []);
      setStories(
        Array.isArray(storyData) ? storyData : (storyData.rows ?? [])
      );
      setActivities(
        Array.isArray(activityData) ? activityData : (activityData.rows ?? [])
      );
      if (!Array.isArray(activityData)) {
        setNextCursor(
          typeof activityData.nextCursor === "number"
            ? activityData.nextCursor
            : null
        );
        setHasMore(Boolean(activityData.hasMore));
      } else {
        setNextCursor(null);
        setHasMore(false);
      }
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      toast.error("Could not load the dashboard", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/activity?mergeByStory=false&dedupe=false&limit=10&before=${nextCursor}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Could not load more activity");
      const data = (await res.json()) as {
        rows?: Activity[];
        nextCursor?: number | null;
        hasMore?: boolean;
      };
      const page = data.rows ?? [];
      setActivities((prev) => {
        const seen = new Set(prev.map((a) => `${a.type}-${a.id}`));
        return [
          ...prev,
          ...page.filter((a) => !seen.has(`${a.type}-${a.id}`)),
        ];
      });
      setNextCursor(typeof data.nextCursor === "number" ? data.nextCursor : null);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      toast.error("Could not load more activity", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const ready = drafts.filter((draft) => draft.status === "drafted").length;
  const failed = drafts.filter((draft) => draft.status === "failed").length;
  const pending = stories.filter((story) => story.status === "pending").length;
  const published = stories.filter(
    (story) => story.status === "published"
  ).length;
  const recent = drafts.slice(0, 5);
  const firstName = session?.user?.name?.split(/\s+/)[0];

  // Activity stats
  const scheduledCount = activities.filter((a) => a.type === "schedule" && a.event === "scheduled").length;
  const publishedCount = activities.filter((a) => a.type === "schedule" && a.event === "published").length;
  const draftCount = activities.filter((a) => a.type === "draft").length;
  const failedCount = activities.filter((a) => a.type === "schedule" && a.event === "failed").length;

  const steps = [
    {
      label: "Connect your Facebook Page",
      done: connection.connected,
      hint: connection.loading
        ? "Checking the Page connection."
        : connection.connected
          ? connection.page?.name ?? "Connected"
          : "Publishing needs a Page connection.",
    },
    {
      label: "Import stories from your feeds",
      done: stories.length > 0,
      hint:
        stories.length > 0
          ? `${stories.length} stories tracked`
          : "Open the story queue and fetch your feeds.",
    },
    {
      label: "Generate your first draft",
      done: drafts.length > 0,
      hint:
        drafts.length > 0
          ? `${drafts.length} drafts created`
          : "Pick a story and draft a post.",
    },
    {
      label: "Review and publish a post",
      done: published > 0,
      hint:
        published > 0
          ? `${published} published`
          : ready > 0
            ? `${ready} draft${ready === 1 ? "" : "s"} waiting`
            : "Drafts will collect here for review.",
    },
  ];

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-brand">
              {formatLongDate()}
            </p>
            <h1 className="page-title mt-1.5">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              {loading
                ? "Loading your workspace…"
                : loadError
                  ? "Couldn't load the workspace just now — try refreshing."
                  : `${ready} draft${ready === 1 ? "" : "s"} ready for review, ${pending} stor${
                    pending === 1 ? "y" : "ies"
                  } in the story queue. ${
                    connection.loading
                      ? "Checking the Facebook Page connection."
                      : connection.connected
                        ? `Facebook is connected to ${connection.page?.name ?? "your Page"}.`
                        : "Connect a Facebook Page to start publishing."
                  }`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
              className="h-9 rounded-[7px] border-line-strong bg-card px-3 text-[12px]"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
                aria-hidden
              />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <Link
              href="/"
              className={buttonVariants({
                variant: "brand",
                className: "h-9 rounded-[7px] px-3 text-[12px]",
              })}
            >
              Open story queue
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <StatCard
            label="Waiting for review"
            value={ready}
            hint="Drafts ready to check"
            icon={FileText}
            loading={loading || loadError}
          />
          <StatCard
            label="Stories in queue"
            value={pending}
            hint={`${stories.length} tracked in total`}
            icon={Newspaper}
            loading={loading || loadError}
          />
          <StatCard
            label="Failed drafts"
            value={failed}
            hint={failed ? "Needs attention" : "No failures"}
            icon={TriangleAlert}
            loading={loading || loadError}
            tone={failed ? "text-destructive" : undefined}
          />
          <article className="panel col-span-2 p-4 xl:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                Publishing
              </span>
              <FacebookMark className="size-4" />
            </div>
            <p className="mt-3 truncate font-heading text-[24px] leading-none">
              {connection.loading
                ? "Checking…"
                : connection.connected
                  ? connection.page?.name ?? "Connected"
                  : "Not connected"}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connection.loading
                    ? "animate-pulse bg-muted-foreground/50"
                    : connection.connected
                      ? "bg-success"
                      : connection.configured
                        ? "bg-warning"
                        : "bg-faint"
                )}
                aria-hidden
              />
              {connection.loading
                ? "Reading connection status"
                : connection.connected
                  ? "Facebook Page live"
                  : connection.configured
                    ? "Page available to connect"
                    : "Add Facebook app credentials"}
            </p>
          </article>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">Activity log</h2>
              <Link
                href="/status"
                className="text-[11px] font-semibold text-brand hover:text-brand-strong"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="animate-pulse px-4 py-3.5">
                    <div className="h-2 w-20 rounded bg-muted" />
                    <div className="mt-2.5 h-3.5 w-2/3 rounded bg-muted" />
                    <div className="mt-2 h-2.5 w-1/3 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : activities.length ? (
              <div className="divide-y divide-border">
                {activities.map((activity) => {
                  const isSchedule = activity.type === "schedule";
                  const isDraft = activity.type === "draft";
                  const kind = activity.kind ?? (isDraft ? "draft" : "post");
                  const scheduleSource = activity.scheduleSource ?? "local";
                  const status = activity.status ?? activity.event;

                  // Determine status variant for StatusPill
                  let pillStatus: string = status;
                  if (isDraft) {
                    pillStatus = status;
                  } else if (activity.event === "published") {
                    pillStatus = "published";
                  } else if (activity.event === "failed") {
                    pillStatus = "failed";
                  } else if (activity.event === "canceled") {
                    pillStatus = "canceled";
                  } else if (activity.event === "scheduled") {
                    pillStatus = "scheduled";
                  }

                  return (
                    <div key={`${activity.type}-${activity.id}`}>
                      <Link
                        href={isSchedule
                          ? `/calendar?post=${activity.scheduledPostId}`
                          : `/drafts/${activity.id}`}
                        className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={pillStatus} />
                            <TimeAgo
                              date={activity.displayTime}
                              className="text-[10.5px] tabular-nums text-muted-foreground"
                            />
                            {kind && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-surface-2">
                                {kind.toUpperCase()}
                              </span>
                            )}
                            {isSchedule && scheduleSource === "facebook" && (
                              <span className="text-[9px] font-medium text-brand px-1.5 py-0.5 rounded bg-brand-soft">
                                FB
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 line-clamp-2 font-heading text-[15.5px] leading-snug">
                            {activity.displayTitle}
                          </p>
                          {(activity.errorMessage || (isDraft && activity.status === "failed")) && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-destructive">
                              {activity.errorMessage ?? "Failed to publish"}
                            </p>
                          )}
                        </div>
                        <ArrowUpRight
                          className="mt-1 size-3.5 shrink-0 text-faint transition-colors group-hover:text-foreground"
                          aria-hidden
                        />
                      </Link>
                      {isSchedule &&
                        activity.event === "failed" &&
                        activity.scheduledPostId && (
                        <RetryButton
                          scheduledPostId={activity.scheduledPostId}
                          activityId={activity.id}
                          onSuccess={() => load()}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : loadError ? (
              <ErrorState
                compact
                className="m-4"
                title="Couldn't load recent activity"
                onRetry={load}
              />
            ) : (
              <div className="px-4 py-12 text-center">
                <Clock className="mx-auto size-5 text-faint" aria-hidden />
                <p className="mt-2 text-[12.5px] font-semibold">No activity yet</p>
                <p className="mx-auto mt-1 max-w-[260px] text-[11px] leading-relaxed text-muted-foreground">
                  Scheduled posts, published content, and drafts will appear here.
                </p>
                <Link
                  href="/"
                  className={buttonVariants({
                    variant: "brand",
                    size: "sm",
                    className: "mt-4 h-8 rounded-[7px] px-3 text-[11.5px]",
                  })}
                >
                  Open story queue
                </Link>
              </div>
            )}

            {!loading && activities.length > 0 && (
              <footer className="border-t border-border bg-card/60 px-3 py-2.5">
                {hasMore ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                    className="w-full"
                  >
                    {loadingMore ? (
                      <RefreshCw
                        className="size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <ChevronDown className="size-3.5" aria-hidden />
                    )}
                    {loadingMore ? "Loading…" : "Load more activity"}
                  </Button>
                ) : (
                  <p className="py-1 text-center text-[10.5px] text-muted-foreground">
                    All activity loaded
                  </p>
                )}
              </footer>
            )}
          </section>

          <div className="flex flex-col gap-4">
            <section className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[12.5px] font-semibold">Channels</h2>
                <Link
                  href="/accounts"
                  className="text-[11px] font-semibold text-brand hover:text-brand-strong"
                >
                  Manage
                </Link>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
                  <PlatformMark platform="facebook" className="size-7 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-semibold">
                      Facebook
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {connection.loading
                        ? "Checking…"
                        : connection.connected
                          ? connection.page?.name
                          : "Ready to connect"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                      connection.loading
                        ? "bg-surface-3 text-muted-foreground"
                        : connection.connected
                          ? "bg-success-soft text-success"
                          : "bg-warning-soft text-warning"
                    )}
                  >
                    {connection.loading
                      ? "Checking"
                      : connection.connected
                        ? "Live"
                        : "Pending"}
                  </span>
                </div>

                {PLANNED.map((channel) => (
                  <div
                    key={channel.platform}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5"
                  >
                    <PlatformMark
                      platform={channel.platform}
                      className="size-7 rounded-md opacity-45"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-medium text-muted-foreground">
                        {channel.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {channel.gate}
                      </p>
                    </div>
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                      Designed
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel p-4">
              <h2 className="text-[12.5px] font-semibold">Next steps</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {steps.map((step) => (
                  <li key={step.label} className="flex items-start gap-2">
                    {step.done ? (
                      <CheckCircle2
                        className="mt-0.5 size-3.5 shrink-0 text-success"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="mt-0.5 size-3.5 shrink-0 text-faint"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-[11.5px] font-medium leading-tight",
                          step.done && "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                        {step.hint}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <p className="mt-6 text-[10.5px] text-muted-foreground">
          Figures update from your workspace records. Analytics arrive once
          channel insights are connected.
        </p>
      </div>
    </AppFrame>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof FileText;
  loading: boolean;
  tone?: string;
}) {
  return (
    <article className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("size-4 text-muted-foreground", tone)} aria-hidden />
      </div>
      <p className="mt-3 font-heading text-[30px] leading-none tabular-nums">
        {loading ? "—" : value}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
    </article>
  );
}
