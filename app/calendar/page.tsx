"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Play, X } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { cn } from "cn";
import { formatDateTime } from "@/lib/format";

type ScheduledPost = {
  id: number;
  text: string;
  scheduled_for: string;
  status: string;
  kind: string;
  source: string;
  news_title: string | null;
  error_message: string | null;
};

const KIND_LABELS: Record<string, string> = {
  post: "Post",
  photo: "Photo",
  video: "Video",
  reel: "Reel",
  live: "Live",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [runningDue, setRunningDue] = useState(false);

  const load = useCallback(async (quiet = false) => {
    try {
      const res = await fetch("/api/schedule", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load the calendar.");
      setPosts(Array.isArray(data) ? data : []);
    } catch (error) {
      if (quiet) return;
      toast.error("Could not load the calendar", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const post of posts) {
      const key = dayKey(new Date(post.scheduled_for));
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [posts]);

  const days = useMemo(() => {
    const start = new Date(cursor);
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });

  const monthPosts = posts.filter((post) => {
    const date = new Date(post.scheduled_for);
    return (
      date.getMonth() === cursor.getMonth() &&
      date.getFullYear() === cursor.getFullYear()
    );
  });

  const overdue = posts.filter(
    (post) =>
      post.status === "scheduled" &&
      // Facebook publishes its own schedules, so "publish now" only applies
      // to the posts this workspace executes itself.
      post.source !== "facebook" &&
      new Date(post.scheduled_for).getTime() <= Date.now()
  );

  const upcoming = posts
    .filter(
      (post) =>
        post.status === "scheduled" &&
        new Date(post.scheduled_for).getTime() > Date.now()
    )
    .slice(0, 6);

  const queued = [...overdue, ...upcoming];

  async function publishDue() {
    setRunningDue(true);
    try {
      const res = await fetch("/api/schedule/run", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Could not publish the due posts.");
      }
      if (!data?.due) {
        toast("Nothing is due right now");
      } else if (data.failed) {
        toast.error("Some scheduled posts failed", {
          description: `${data.published} published · ${data.failed} failed. Check the calendar for details.`,
        });
      } else {
        toast.success(
          data.published === 1
            ? "Scheduled post published"
            : `${data.published} scheduled posts published`
        );
      }
      await load();
    } catch (error) {
      toast.error("Could not run the scheduler", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setRunningDue(false);
    }
  }

  function moveMonth(delta: number) {
    setCursor((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + delta);
      return next;
    });
  }

  async function cancelPost(id: number) {
    const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error("Could not cancel the post", {
        description:
          data?.error ??
          "The post could not be cancelled. Please try again.",
      });
      return;
    }
    setPosts((current) => current.filter((post) => post.id !== id));
    toast("Scheduled post canceled");
  }

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-brand">
              Workspace
            </p>
            <h1 className="page-title mt-1.5">Calendar</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              Everything scheduled in this workspace — drafts queued by the
              Story Queue and posts, photos, videos, reels and live streams
              scheduled on Facebook.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="min-w-[132px] text-center text-[12.5px] font-semibold">
              {monthLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                const now = new Date();
                setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void publishDue()}
              disabled={runningDue || overdue.length === 0}
              title={
                overdue.length
                  ? "Publish every overdue scheduled post now"
                  : "Nothing is due right now"
              }
            >
              <Play
                className={cn("size-3.5", runningDue && "animate-pulse")}
                aria-hidden
              />
              {runningDue ? "Publishing…" : "Publish due now"}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="panel overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="px-2 py-2 text-center text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const key = dayKey(day);
                const items = byDay.get(key) ?? [];
                const inMonth = day.getMonth() === cursor.getMonth();
                const isToday = key === dayKey(new Date());

                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[104px] border-b border-r border-border/70 p-1.5 [&:nth-child(7n)]:border-r-0",
                      !inMonth && "bg-surface-2/40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "grid size-6 place-items-center rounded-full text-[11px] tabular-nums",
                          isToday
                            ? "bg-ink font-semibold text-paper"
                            : inMonth
                              ? "text-foreground"
                              : "text-faint"
                        )}
                      >
                        {day.getDate()}
                      </span>
                      {items.length > 0 && (
                        <span className="text-[9px] font-semibold text-muted-foreground">
                          {items.length}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      {items.slice(0, 2).map((post) => (
                        <div
                          key={post.id}
                          title={post.text}
                          className={cn(
                            "truncate rounded px-1.5 py-1 text-[10px] font-medium",
                            post.status === "published"
                              ? "bg-success-soft text-success"
                              : post.status === "failed"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-brand-soft text-brand-strong"
                          )}
                        >
                          {timeLabel(post.scheduled_for)} ·{" "}
                          <span className="font-semibold uppercase tracking-wide">
                            {KIND_LABELS[post.kind] ?? post.kind}
                          </span>
                          {" · "}
                          {post.news_title ?? post.text}
                        </div>
                      ))}
                      {items.length > 2 && (
                        <p className="px-1.5 text-[9.5px] text-muted-foreground">
                          +{items.length - 2} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-[12.5px] font-semibold">Scheduled</h2>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {queued.length}
                </span>
              </div>

              {loading ? (
                <div className="animate-pulse px-4 py-4">
                  <div className="h-3 w-2/3 rounded bg-muted" />
                  <div className="mt-2 h-2.5 w-1/2 rounded bg-muted" />
                </div>
              ) : queued.length ? (
                <ul className="divide-y divide-border">
                  {queued.map((post) => {
                    const late =
                      new Date(post.scheduled_for).getTime() <= Date.now();
                    return (
                      <li key={post.id} className="group px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "flex items-center gap-1.5 text-[10.5px] font-semibold",
                                late
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              )}
                            >
                              <Clock className="size-3" aria-hidden />
                              {late ? "Overdue · " : ""}
                              {formatDateTime(post.scheduled_for)}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-brand">
                              {KIND_LABELS[post.kind] ?? post.kind}
                              <span className="font-medium normal-case tracking-normal text-muted-foreground">
                                {post.source === "facebook"
                                  ? "· published by Facebook"
                                  : "· published by this workspace"}
                              </span>
                            </p>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-snug">
                              {post.news_title ?? post.text}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void cancelPost(post.id)}
                            aria-label="Cancel scheduled post"
                            className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-4 py-8 text-center">
                  <CalendarDays className="mx-auto size-5 text-faint" aria-hidden />
                  <p className="mt-2 text-[12px] font-semibold">
                    Nothing scheduled
                  </p>
                  <p className="mx-auto mt-1 max-w-[220px] text-[11px] leading-relaxed text-muted-foreground">
                    Schedule a draft from the composer to see it here.
                  </p>
                </div>
              )}
            </section>

            <section className="panel p-4">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                This month
              </p>
              <p className="mt-2 font-heading text-[24px] leading-none">
                {monthPosts.length}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                posts scheduled or published
              </p>
              {monthPosts.some((post) => post.status === "failed") && (
                <div className="mt-3 flex items-center gap-2">
                  <StatusPill status="failed" />
                  <span className="text-[10.5px] text-muted-foreground">
                    needs attention
                  </span>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </AppFrame>
  );
}
