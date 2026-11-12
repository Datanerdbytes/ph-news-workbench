"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  FileText,
  Heart,
  MessageCircle,
  Newspaper,
  Share2,
  Sparkles,
} from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { useFacebookConnection } from "@/components/facebook-connection";
import { PlatformMark } from "@/components/platform-mark";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "cn";

type TopPost = {
  id: string;
  message: string | null;
  permalinkUrl: string | null;
  createdAt: string;
  shares: number | null;
  reactions: number | null;
  comments: number | null;
};

type InstagramPost = {
  id: string;
  caption: string | null;
  permalink: string | null;
  timestamp: string;
  mediaType: string | null;
  likes: number | null;
  comments: number | null;
};

type InstagramOverview = {
  username: string | null;
  followers: number | null;
  mediaCount: number | null;
  recent: InstagramPost[];
};

type Totals = {
  drafts: number;
  published: number;
  scheduled: number;
  failed: number;
  tokens: number;
  cost: number;
};

type Day = {
  day: string;
  drafts: number;
  published: number;
  scheduled: number;
};

type PageInsights = {
  connected: boolean;
  available?: boolean;
  pageName?: string;
  fans?: number | null;
  followers?: number | null;
  engagements7d?: number | null;
  mediaViews7d?: number | null;
  topPosts?: TopPost[] | null;
  topPostsError?: string | null;
  instagram?: InstagramOverview | null;
  instagramError?: string | null;
  reason?: string;
};

function shortDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function lastFourteenDays() {
  const days: string[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86_400_000);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

function dayLabel(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  return {
    weekday: date.toLocaleDateString("en-PH", {
      weekday: "short",
      timeZone: "UTC",
    }),
    day: date.toLocaleDateString("en-PH", {
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

export default function AnalyticsPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [daily, setDaily] = useState<Day[]>([]);
  const [insights, setInsights] = useState<PageInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [insightsError, setInsightsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const connection = useFacebookConnection();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/analytics", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => {
        setTotals(data.totals ?? null);
        setDaily(Array.isArray(data.daily) ? data.daily : []);
        setLoadError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/facebook/insights", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => {
        setInsights(data);
        setInsightsError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setInsightsError(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const series = useMemo(() => {
    const byDay = new Map(daily.map((entry) => [entry.day, entry]));
    return lastFourteenDays().map((day) => ({
      day,
      drafts: byDay.get(day)?.drafts ?? 0,
      published: byDay.get(day)?.published ?? 0,
      scheduled: byDay.get(day)?.scheduled ?? 0,
    }));
  }, [daily]);

  const peak = Math.max(
    1,
    ...series.map((entry) => entry.drafts + entry.published + entry.scheduled)
  );

  const cards = [
    {
      label: "Published posts",
      value: totals?.published ?? 0,
      hint: "Delivered to the connected Page",
      icon: CircleCheck,
    },
    {
      label: "Scheduled",
      value: totals?.scheduled ?? 0,
      hint: "Queued and waiting to send",
      icon: CalendarClock,
    },
    {
      label: "Drafts created",
      value: totals?.drafts ?? 0,
      hint: "AI-assisted drafts in this workspace",
      icon: FileText,
    },
    {
      label: "AI spend",
      value: totals ? `$${totals.cost.toFixed(3)}` : "—",
      hint: totals
        ? `${totals.tokens.toLocaleString()} tokens used`
        : loadError
          ? "Couldn't load usage"
          : "No usage yet",
      icon: Sparkles,
    },
  ];

  function retryAnalytics() {
    setLoading(true);
    setLoadError(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Insights</p>
            <h1 className="page-title mt-1">Analytics</h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Publishing activity from the last 14 days, pulled from this
              workspace.
            </p>
          </div>
          {connection.connected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-secondary-foreground">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              {connection.page?.name ?? "Facebook Page"}
            </span>
          )}
        </div>

        {totals?.failed ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {totals.failed} scheduled post{totals.failed === 1 ? "" : "s"}{" "}
            failed to publish. Check the calendar for details.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {card.label}
                  </p>
                  <Icon className="size-4 text-brand" aria-hidden />
                </div>
                <p className="mt-2 font-heading text-2xl font-semibold leading-none">
                  {loading || loadError ? "—" : card.value}
                </p>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  {card.hint}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-semibold">Activity</h2>
                <p className="text-[10.5px] text-muted-foreground">
                  Drafts, publishes and schedules per day
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <Legend className="bg-brand-soft" label="Drafts" />
                <Legend className="bg-brand" label="Published" />
                <Legend className="bg-ink/25" label="Scheduled" />
              </div>
            </div>

            {loadError ? (
              <ErrorState
                compact
                className="mt-4"
                title="Couldn't load activity"
                onRetry={retryAnalytics}
              />
            ) : (
              <div className="mt-4 flex h-40 items-end gap-1.5 sm:gap-2">
              {series.map((entry) => {
                const total = entry.drafts + entry.published + entry.scheduled;
                const scale = (value: number) => `${(value / peak) * 100}%`;
                const label = dayLabel(entry.day);
                return (
                  <div
                    key={entry.day}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1"
                    title={`${entry.day}: ${entry.drafts} drafts · ${entry.published} published · ${entry.scheduled} scheduled`}
                  >
                    <div className="flex h-full w-full flex-col justify-end overflow-hidden rounded-t bg-surface-2">
                      {entry.scheduled > 0 && (
                        <div
                          className="w-full bg-ink/25"
                          style={{ height: scale(entry.scheduled) }}
                        />
                      )}
                      {entry.published > 0 && (
                        <div
                          className="w-full bg-brand"
                          style={{ height: scale(entry.published) }}
                        />
                      )}
                      {entry.drafts > 0 && (
                        <div
                          className="w-full bg-brand-soft"
                          style={{ height: scale(entry.drafts) }}
                        />
                      )}
                      {total === 0 && <div className="h-0.5 w-full bg-border" />}
                    </div>
                    <div className="text-center text-[9px] leading-tight text-muted-foreground">
                      <p>{label.weekday}</p>
                      <p className="font-semibold text-muted-foreground">
                        {label.day}
                      </p>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-semibold">Top posts</h2>
                <p className="text-[10.5px] text-muted-foreground">
                  Latest Facebook posts and how they landed
                </p>
              </div>
              {insights?.topPosts?.length ? (
                <Newspaper className="size-4 text-brand" aria-hidden />
              ) : null}
            </div>

            {insights?.topPosts?.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {insights.topPosts.map((post) => (
                  <li
                    key={post.id}
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {shortDate(post.createdAt)}
                      </p>
                      <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                        {post.reactions !== null && (
                          <span className="inline-flex items-center gap-1">
                            <Heart className="size-3" aria-hidden />
                            {post.reactions}
                          </span>
                        )}
                        {post.comments !== null && (
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="size-3" aria-hidden />
                            {post.comments}
                          </span>
                        )}
                        {post.shares !== null && (
                          <span className="inline-flex items-center gap-1">
                            <Share2 className="size-3" aria-hidden />
                            {post.shares}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-foreground">
                      {post.message?.trim() || "(no text — media post)"}
                    </p>
                    {post.permalinkUrl && (
                      <a
                        href={post.permalinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[10px] font-semibold text-brand hover:underline"
                      >
                        View post
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {insights?.topPostsError
                  ? `Posts are unavailable right now: ${insights.topPostsError}`
                  : insights?.connected
                    ? "No published posts yet — publish one and it will show up here."
                    : "Connect a Facebook Page to see its posts."}
              </p>
            )}
          </section>
          </div>

          <div className="flex flex-col gap-3">
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold">Page audience</h2>
                  <p className="text-[10.5px] text-muted-foreground">
                    Live from Facebook Insights · last 7 days
                  </p>
                </div>
                {insights?.available && (
                  <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                    Live
                  </span>
                )}
              </div>

              {insights && !insights.connected ? (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Connect a Facebook Page to see its audience and engagement.
                </p>
              ) : insights && insights.available === false ? (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Insights are unavailable right now
                  {insights.reason ? `: ${insights.reason}` : "."}
                </p>
              ) : insightsError ? (
                <p className="mt-3 text-[11px] text-destructive">
                  Couldn&apos;t load Page insights. Try refreshing the page.
                </p>
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <Metric label="Followers" value={insights?.followers} />
                  <Metric label="Fans" value={insights?.fans} />
                  <Metric
                    label="Engagements"
                    value={insights?.engagements7d}
                  />
                  <Metric label="Media views" value={insights?.mediaViews7d} />
                </dl>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <PlatformMark platform="instagram" className="size-3.5" />
                    Instagram
                  </h2>
                  <p className="text-[10.5px] text-muted-foreground">
                    {insights?.instagram?.username
                      ? `@${insights.instagram.username}`
                      : "Linked to your Facebook Page"}
                  </p>
                </div>
                {insights?.instagram && (
                  <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                    Live
                  </span>
                )}
              </div>

              {insights?.instagram ? (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <Metric
                      label="Followers"
                      value={insights.instagram.followers}
                    />
                    <Metric
                      label="Posts"
                      value={insights.instagram.mediaCount}
                    />
                  </dl>
                  {insights.instagram.recent.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {insights.instagram.recent.slice(0, 3).map((post) => (
                        <li
                          key={post.id}
                          className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                              {shortDate(post.timestamp)}
                              {post.mediaType
                                ? ` · ${post.mediaType === "VIDEO" ? "Reel" : post.mediaType === "CAROUSEL_ALBUM" ? "Carousel" : "Post"}`
                                : ""}
                            </p>
                            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                              {post.likes !== null && (
                                <span className="inline-flex items-center gap-1">
                                  <Heart className="size-3" aria-hidden />
                                  {post.likes}
                                </span>
                              )}
                              {post.comments !== null && (
                                <span className="inline-flex items-center gap-1">
                                  <MessageCircle className="size-3" aria-hidden />
                                  {post.comments}
                                </span>
                              )}
                            </div>
                          </div>
                          {post.caption && (
                            <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground">
                              {post.caption}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {insights?.instagramError
                    ? `Instagram insights are unavailable right now: ${insights.instagramError}`
                    : "No professional Instagram account is linked to your Facebook Pages yet."}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-[13px] font-semibold">Channels</h2>
            <p className="text-[10.5px] text-muted-foreground">
              Where this workspace can publish today
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              <li className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
                <span className="grid size-7 place-items-center rounded-md bg-[#1877f2] text-[10px] font-bold text-white">
                  f
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-semibold">
                    Facebook Page
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {connection.loading
                      ? "Checking connection…"
                      : connection.connected
                        ? (connection.page?.name ?? "Connected")
                        : "Not connected"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                    connection.connected
                      ? "bg-success/10 text-success"
                      : "bg-surface-3 text-muted-foreground"
                  )}
                >
                  {connection.connected ? "Live" : "Off"}
                </span>
              </li>
              {["Instagram", "X", "LinkedIn", "TikTok"].map((channel) => (
                <li
                  key={channel}
                  className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 opacity-70"
                >
                  <span className="grid size-7 place-items-center rounded-md bg-surface-3 text-[10px] font-bold text-muted-foreground">
                    {channel.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-semibold">
                      {channel}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Adapter planned
                    </p>
                  </div>
                  <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Soon
                  </span>
                </li>
              ))}
            </ul>
            </section>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function Metric({ label, value }: { label: string; value?: number | null }) {
  return (
    <div>
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-heading text-lg font-semibold leading-none">
        {typeof value === "number" ? value.toLocaleString() : "—"}
      </dd>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}
