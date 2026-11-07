"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Link2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { notificationSeverity } from "@/lib/notification-meta";
import { TimeAgo } from "@/components/time-ago";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  rows: NotificationRow[];
  unread: number;
  nextCursor: number | null;
  hasMore: boolean;
};

const POLL_MS = 30_000;
const PAGE_SIZE = 15;
/** One toast per new row, capped so a busy sweep can't flood the screen. */
const MAX_TOASTS_PER_POLL = 3;

function typeIcon(type: string) {
  if (type === "facebook_token_invalid") return Link2;
  if (
    type === "crosspost_partial_failure" ||
    type === "facebook_oauth_failed"
  ) {
    return AlertTriangle;
  }
  if (type === "scheduled_publish_success" || type === "facebook_reconnected") {
    return CheckCircle2;
  }
  return XCircle;
}

const severityClasses: Record<string, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

async function markRead(id: number | "all") {
  await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(id === "all" ? { all: true } : { id }),
  });
}

function mergeRows(
  current: NotificationRow[],
  incoming: NotificationRow[]
): NotificationRow[] {
  const seen = new Set(current.map((row) => row.id));
  const merged = [...current];
  for (const row of incoming) {
    if (!seen.has(row.id)) merged.push(row);
  }
  return merged.sort((a, b) => Number(b.id) - Number(a.id));
}

function toastArriving(
  rows: NotificationRow[],
  router: ReturnType<typeof useRouter>
) {
  if (!rows.length) return;

  const push = (row: NotificationRow) => {
    const severity = notificationSeverity(row.type);
    const options = {
      description: row.body ?? undefined,
      action: row.link
        ? { label: "Open", onClick: () => router.push(row.link as string) }
        : undefined,
    };
    if (severity === "success") toast.success(row.title, options);
    else if (severity === "error") toast.error(row.title, options);
    else toast.info(row.title, options);
  };

  if (rows.length <= MAX_TOASTS_PER_POLL) {
    for (const row of rows) push(row);
    return;
  }
  toast.info(`${rows.length} new notifications`, {
    description: rows[0].title,
  });
}

export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Highest notification id already seen — the watermark for toasting. */
  const maxSeenIdRef = useRef(0);
  const seededRef = useRef(false);

  const refresh = useCallback(
    async (announce: boolean) => {
      try {
        const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as NotificationsResponse;
        const previousMax = maxSeenIdRef.current;
        setRows(data.rows);
        setUnread(data.unread);
        setHasMore(data.hasMore);

        const newest = data.rows.reduce(
          (max, row) => Math.max(max, Number(row.id)),
          previousMax
        );
        if (!seededRef.current) {
          // First load only sets the watermark — history must not toast.
          maxSeenIdRef.current = newest;
          seededRef.current = true;
          return;
        }
        maxSeenIdRef.current = newest;

        if (announce && !document.hidden) {
          toastArriving(
            data.rows.filter((row) => Number(row.id) > previousMax),
            router
          );
        }
      } catch {
        // Offline or restarting server — the next tick retries quietly.
      }
    },
    [router]
  );

  useEffect(() => {
    void refresh(false);
    const interval = setInterval(() => void refresh(true), POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Close the panel on navigation, matching the other header popovers.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openPanel() {
    setOpen(true);
    // Refresh silently — the user is already looking at the list.
    await refresh(false);
  }

  async function loadMore() {
    if (!hasMore || !rows.length) return;
    try {
      const res = await fetch(
        `/api/notifications?limit=${PAGE_SIZE}&before=${rows[rows.length - 1].id}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as NotificationsResponse;
      setRows((current) => mergeRows(current, data.rows));
      setHasMore(data.hasMore);
      setUnread(data.unread);
    } catch {
      // Ignore — the panel keeps what it already has.
    }
  }

  async function onRowClick(row: NotificationRow) {
    if (!row.readAt) {
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, readAt: new Date().toISOString() }
            : item
        )
      );
      setUnread((value) => Math.max(0, value - 1));
      void markRead(Number(row.id));
    }
    setOpen(false);
    if (row.link) router.push(row.link);
  }

  async function onMarkAll() {
    setRows((current) =>
      current.map((item) =>
        item.readAt ? item : { ...item, readAt: new Date().toISOString() }
      )
    );
    setUnread(0);
    try {
      await markRead("all");
    } catch {
      void refresh(false);
    }
  }

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openPanel())}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Notifications"
        className="relative grid size-8 shrink-0 place-items-center rounded-[7px] border border-border bg-card transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Bell className="size-4 text-muted-foreground" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-80 rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-[12px] font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void onMarkAll()}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto p-1">
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11.5px] text-muted-foreground">
                You&rsquo;re all caught up.
              </p>
            ) : (
              rows.map((row) => {
                const Icon = typeIcon(row.type);
                const severity = notificationSeverity(row.type);
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="menuitem"
                    onClick={() => void onRowClick(row)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      row.readAt
                        ? "hover:bg-surface-3"
                        : "bg-surface-2 hover:bg-surface-3"
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        severityClasses[severity] ?? "text-info"
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {!row.readAt && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-brand"
                            aria-hidden
                          />
                        )}
                        <span className="truncate text-[12px] font-semibold">
                          {row.title}
                        </span>
                      </span>
                      {row.body && (
                        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                          {row.body}
                        </span>
                      )}
                      <TimeAgo
                        date={row.createdAt}
                        className="mt-1 block text-[10px] text-faint"
                      />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {hasMore && rows.length > 0 && (
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => void loadMore()}
                className="w-full rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
