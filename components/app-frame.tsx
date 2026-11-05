"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Film,
  FileText,
  Images,
  LayoutDashboard,
  Newspaper,
  LogOut,
  Menu,
  PenLine,
  Plus,
  Radio,
  Rss,
  Settings,
  Sparkles,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { FacebookMark } from "@/components/facebook-mark";
import { useFacebookConnection } from "@/components/facebook-connection";
import { authClient } from "@/lib/auth-client";

type NavItem = {
  href?: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/", label: "Story Queue", icon: Newspaper, exact: true },
      { href: "/status", label: "Drafts", icon: FileText },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Publish",
    items: [
      { href: "/post", label: "Post", icon: PenLine },
      { href: "/photos", label: "Photos", icon: Images },
      { href: "/videos", label: "Videos", icon: Film },
      { href: "/downloads", label: "Downloads", icon: Download },
      { href: "/reels", label: "Reels", icon: Video },
      { href: "/live", label: "Live", icon: Radio },
      { href: "/stories", label: "Stories", icon: Sparkles },
    ],
  },
  {
    title: "Grow",
    items: [
      { href: "/analytics", label: "Analytics", icon: ChartColumn },
      { href: "/accounts", label: "Accounts", icon: Users },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/sources", label: "Sources", icon: Rss },
      { href: "/team", label: "Team", icon: UserPlus },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const PUBLISH_LINKS = [
  {
    href: "/post",
    label: "Post",
    hint: "Standard text posts",
    icon: PenLine,
  },
  {
    href: "/photos",
    label: "Photos",
    hint: "Single posts, carousels, albums",
    icon: Images,
  },
  {
    href: "/videos",
    label: "Videos",
    hint: "Long-form video uploads",
    icon: Film,
  },
  { href: "/reels", label: "Reels", hint: "Short vertical video", icon: Video },
  { href: "/live", label: "Live", hint: "RTMP streams & comments", icon: Radio },
  {
    href: "/stories",
    label: "Stories",
    hint: "Photo & video stories",
    icon: Sparkles,
  },
];

function isActivePath(pathname: string, item: NavItem) {
  if (!item.href) return false;
  if (item.exact) return pathname === item.href;
  if (item.href === "/status")
    return pathname.startsWith("/status") || pathname.startsWith("/drafts");
  return pathname.startsWith(item.href);
}

function pageLabel(pathname: string) {
  if (pathname === "/") return "Story Queue";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/status") || pathname.startsWith("/drafts"))
    return "Drafts";
  if (pathname.startsWith("/accounts")) return "Accounts";
  if (pathname.startsWith("/analytics")) return "Analytics";
  if (pathname.startsWith("/team")) return "Team";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/calendar")) return "Calendar";
  if (pathname.startsWith("/post")) return "Post";
  if (pathname.startsWith("/photos")) return "Photos";
  if (pathname.startsWith("/videos")) return "Videos";
  if (pathname.startsWith("/downloads")) return "Downloads";
  if (pathname.startsWith("/reels")) return "Reels";
  if (pathname.startsWith("/live")) return "Live";
  if (pathname.startsWith("/stories")) return "Stories";
  if (pathname.startsWith("/sources")) return "Sources";
  return "Workspace";
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AppFrame({
  children,
  fill = false,
}: {
  children: React.ReactNode;
  fill?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [workspace, setWorkspace] = useState<{
    name: string;
    role: string;
    memberCount: number;
  } | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const { data: session } = authClient.useSession();
  const connection = useFacebookConnection();

  const workspaceName =
    workspace?.name ?? connection.page?.name ?? "News Workbench";
  const userName = session?.user?.name ?? "Owner account";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setWorkspace(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setNavOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <div
      className={cn(
        "bg-background",
        fill ? "fixed inset-0 overflow-clip" : "min-h-dvh"
      )}
    >
      <div
        className={cn(
          "lg:grid lg:grid-cols-[250px_minmax(0,1fr)]",
          fill ? "h-full" : "min-h-dvh lg:h-dvh lg:overflow-hidden"
        )}
      >
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col gap-4 border-r border-border bg-card p-3 transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0 lg:shadow-none",
            navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
          )}
          aria-label="Workspace navigation"
        >
          <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-2 px-2.5 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink font-heading text-sm font-semibold text-paper">
              {initials(workspaceName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold leading-tight">
                {workspaceName}
              </p>
              <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">
                {workspace?.role === "editor"
                  ? "Editor workspace"
                  : "Owner workspace"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <Link
            href="/"
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand text-[12.5px] font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus className="size-4" aria-hidden />
            New post
          </Link>

          <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-1">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-0.5">
                <p className="px-2.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item);
                  const Icon = item.icon;

                  if (!item.href) {
                    return (
                      <span
                        key={item.label}
                        aria-disabled
                        title="Coming soon"
                        className="flex cursor-not-allowed items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[12.5px] font-medium text-muted-foreground/70"
                      >
                        <Icon
                          className="size-4 shrink-0 text-faint"
                          aria-hidden
                        />
                        {item.label}
                        <span className="ml-auto rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-faint">
                          Soon
                        </span>
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        active
                          ? "bg-brand-soft font-semibold text-brand-strong shadow-[inset_2px_0_0_var(--brand)]"
                          : "text-secondary-foreground hover:bg-surface-3 hover:text-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-brand" : "text-muted-foreground"
                        )}
                        aria-hidden
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="flex flex-col gap-2.5">
            <Link
              href="/accounts"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">
                Publishing
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <FacebookMark className="size-5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold leading-tight">
                    {connection.loading
                      ? "Checking…"
                      : connection.connected
                        ? connection.page?.name
                        : connection.configured
                          ? "Connect a Page"
                          : "Setup needed"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
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
                      ? "Facebook Page"
                      : connection.connected
                        ? "Connected"
                        : "Not connected"}
                  </p>
                </div>
                <ChevronRight className="size-3.5 text-faint" aria-hidden />
              </div>
            </Link>

            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[10.5px] font-bold text-secondary-foreground">
                  {initials(userName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-semibold leading-tight">
                    {userName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Owner</p>
                </div>
                <ChevronsUpDown
                  className="size-3.5 shrink-0 text-faint"
                  aria-hidden
                />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute inset-x-0 bottom-[calc(100%+6px)] z-50 rounded-lg border border-border bg-card p-1 shadow-lg"
                >
                  <p className="truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                    {session?.user?.email ?? "Owner account"}
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void signOut()}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <LogOut className="size-3.5" aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {navOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-col lg:h-full">
          <header className="sticky top-0 z-30 flex h-[58px] shrink-0 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              className="grid size-8 place-items-center rounded-[7px] border border-border bg-card text-secondary-foreground hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
            >
              <Menu className="size-4" aria-hidden />
            </button>

            <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <span className="hidden truncate sm:inline">{workspaceName}</span>
              <ChevronRight
                className="hidden size-3 text-faint sm:block"
                aria-hidden
              />
              <strong className="truncate font-semibold text-foreground">
                {pageLabel(pathname)}
              </strong>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <StoryQueueQuickLink />
              <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
              <PublishQuickNav />
              <FacebookConnectionButton />
            </div>
          </header>

          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              fill ? "overflow-clip" : "lg:overflow-y-auto"
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function StoryQueueQuickLink() {
  const pathname = usePathname();
  const active = pathname === "/";

  return (
    <Link
      href="/"
      aria-label="Story Queue"
      aria-current={active ? "page" : undefined}
      title="Story Queue"
      className={cn(
        "flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active
          ? "bg-brand-soft text-brand-strong"
          : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
      )}
    >
      <Newspaper
        className={cn("size-3.5", active && "text-brand")}
        aria-hidden
      />
      <span className="hidden sm:inline">Story Queue</span>
    </Link>
  );
}

function PublishQuickNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative flex items-center">
      <nav aria-label="Publishing tools" className="hidden items-center gap-0.5 lg:flex">
        {PUBLISH_LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                active
                  ? "bg-brand-soft text-brand-strong"
                  : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
              )}
            >
              <Icon
                className={cn("size-3.5", active && "text-brand")}
                aria-hidden
              />
              <span className="hidden xl:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 rounded-[7px] border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
      >
        Publish
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {PUBLISH_LINKS.map(({ href, label, hint, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active
                    ? "bg-brand-soft text-brand-strong"
                    : "text-secondary-foreground hover:bg-surface-3 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-brand" : "text-muted-foreground"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold">
                    {label}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {hint}
                  </span>
                </span>
                <ChevronRight className="size-3 text-faint" aria-hidden />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function facebookStatus(connection: ReturnType<typeof useFacebookConnection>) {
  if (connection.loading) {
    return {
      label: "Checking…",
      dot: "animate-pulse bg-muted-foreground/50",
    };
  }
  if (connection.unreachable) {
    return { label: "Status unavailable", dot: "bg-muted-foreground/40" };
  }
  if (connection.connected) {
    return {
      label: connection.page?.name ?? "Connected",
      dot: "bg-success",
    };
  }
  if (!connection.configured) {
    return { label: "Setup needed", dot: "bg-faint" };
  }
  return { label: "Not connected", dot: "bg-warning" };
}

function FacebookConnectionButton() {
  const connection = useFacebookConnection();
  const status = facebookStatus(connection);

  function handleClick() {
    if (connection.connected) {
      toast(`${connection.page?.name ?? "Facebook Page"} connected`, {
        description: "Facebook Page connection",
        action: {
          label: "Disconnect",
          onClick: () => {
            void connection.disconnect();
          },
        },
      });
      return;
    }

    connection.connect();
  }

  const title = connection.connected
    ? `Facebook: ${connection.page?.name ?? "connected"}`
    : status.label;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        connection.connected
          ? "Manage Facebook Page connection"
          : "Connect Facebook Page"
      }
      title={title}
      className="relative grid size-8 shrink-0 place-items-center rounded-[7px] border border-border bg-card transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <FacebookMark className="size-5" />
      <span
        className={cn(
          "absolute right-1 top-1 size-1.5 rounded-full ring-2 ring-card",
          status.dot
        )}
        aria-hidden
      />
    </button>
  );
}
