"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Download,
  ExternalLink,
  Film,
  FileText,
  Globe,
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
import { cn } from "cn";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FacebookMark } from "@/components/facebook-mark";
import { PlatformMark, type PlatformKind } from "@/components/platform-mark";
import { useFacebookConnection } from "@/components/facebook-connection";
import { NotificationBell } from "@/components/notifications";
import {
  PageAvatar,
  useManagedPages,
} from "@/components/publishing/publish-page";
import { authClient } from "@/lib/auth-client";
import {
  facebookToolsVisible,
  platformSectionFromPath,
  type PlatformSection,
} from "@/lib/platform-nav";
import {
  focusFirstIn,
  trapTabFocus,
  useDismissable,
  useMediaQuery,
} from "@/lib/dialog-a11y";

type NavItem = {
  href?: string;
  label: string;
  // lucide dropped brand icons, so platform entries carry a brand tile
  // (PlatformMark) instead of a glyph component.
  icon?: typeof LayoutDashboard;
  mark?: PlatformKind;
  exact?: boolean;
  facebookOnly?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/", label: "Story Queue", icon: Newspaper, exact: true, facebookOnly: true },
      { href: "/status", label: "Drafts", icon: FileText },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Publish",
    items: [
      { href: "/post", label: "Post", icon: PenLine, facebookOnly: true },
      { href: "/photos", label: "Photos", icon: Images, facebookOnly: true },
      { href: "/videos", label: "Videos", icon: Film, facebookOnly: true },
      { href: "/downloads", label: "Downloads", icon: Download },
      { href: "/reels", label: "Reels", icon: Video, facebookOnly: true },
      { href: "/live", label: "Live", icon: Radio, facebookOnly: true },
      { href: "/stories", label: "Stories", icon: Sparkles, facebookOnly: true },
      { href: "/instagram", label: "Instagram", mark: "instagram" },
      { href: "/youtube", label: "YouTube", mark: "youtube" },
    ],
  },
  {
    title: "Grow",
    items: [
      { href: "/analytics", label: "Analytics", icon: ChartColumn },
      { href: "/accounts", label: "Accounts", icon: Users },
      { href: "/platforms", label: "Platforms", icon: Globe },
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
  if (pathname.startsWith("/platforms")) return "Platforms";
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
  if (pathname.startsWith("/instagram")) return "Instagram";
  if (pathname.startsWith("/youtube")) return "YouTube";
  if (pathname.startsWith("/tiktok")) return "TikTok";
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
  const showFacebookTools = facebookToolsVisible(pathname);
  const navGroups = showFacebookTools
    ? NAV_GROUPS
    : NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.facebookOnly),
      }));
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [workspace, setWorkspace] = useState<{
    name: string;
    role: string;
    memberCount: number;
  } | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountPanelRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  // The drawer is a hidden overlay below lg only — inert keeps the closed
  // drawer out of the tab order and the a11y tree without touching the
  // always-visible desktop sidebar.
  const isDesktopNav = useMediaQuery("(min-width: 1024px)");
  const { data: session } = authClient.useSession();
  const connection = useFacebookConnection();
  // The sidebar's Publishing card mirrors the page selection shared with the
  // composers, so switching pages anywhere updates it live.
  const { pages: managedPages, selected: selectedPageIds } = useManagedPages();
  const activePublishingPage = managedPages.find(
    (page) => page.id === selectedPageIds[0]
  );
  // Non-Facebook platforms publish to their own channel, not the shared
  // Facebook Page — the sidebar card reflects the section you're in so it
  // never claims "The Daily Buzz" while you're looking at YouTube. Instagram
  // publishes through the Page's linked professional account, so its card
  // reports the IG link state instead of the Page name.
  const platformSection = platformSectionFromPath(pathname);
  // Status payload for the current platform studio, fetched once per section
  // and tagged with the section it belongs to so a navigation never shows a
  // previous platform's data while the next one is loading.
  const [platformStatus, setPlatformStatus] = useState<{
    section: PlatformSection;
    data: {
      configured: boolean;
      connected: boolean;
      account?: { id?: string; name?: string } | null;
      ig?: { username: string } | null;
      reason?: string | null;
    } | null;
  } | null>(null);

  useEffect(() => {
    if (!platformSection) return;
    const controller = new AbortController();
    fetch(`/api/${platformSection}/status`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data)
          setPlatformStatus({
            section: platformSection,
            data: data as PlatformStatus | null,
          });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [platformSection]);
  const platformStatusForSection =
    platformStatus?.section === platformSection
      ? platformStatus.data
      : null;

  const workspaceName =
    workspace?.name ?? connection.page?.name ?? "News Workbench";
  const userName = session?.user?.name ?? "Owner account";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("workspace request failed");
        return res.json();
      })
      .then((data) => {
        if (data) setWorkspace(data);
      })
      .catch((error) => {
        // Navigations abort this fetch on purpose; anything else is a real
        // failure and the fallback name should say why it showed up.
        if ((error as Error)?.name === "AbortError") return;
        toast.error("Workspace details unavailable", {
          description: "Showing the default workspace name.",
        });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setNavOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  const closeAccountMenu = useCallback(
    (reason: "escape" | "outside") => {
      setAccountOpen(false);
      if (reason === "escape") accountTriggerRef.current?.focus();
    },
    [setAccountOpen]
  );

  useDismissable(accountOpen, closeAccountMenu, accountRef);

  useEffect(() => {
    if (!accountOpen) return;
    if (accountPanelRef.current) focusFirstIn(accountPanelRef.current);
  }, [accountOpen]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
      toast.error("Could not sign out", {
        description: "Please try again.",
      });
    }
  }

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        hamburgerRef.current?.focus();
        return;
      }
      if (drawerRef.current) trapTabFocus(drawerRef.current, event);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      if (drawerRef.current) focusFirstIn(drawerRef.current);
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      cancelAnimationFrame(raf);
    };
  }, [navOpen]);

  return (
    <div
      className={cn(
        "bg-background",
        fill ? "fixed inset-0 overflow-clip" : "min-h-dvh"
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>
      <div
        className={cn(
          // Regular pages scroll the document naturally — a nested
          // fixed-height scroll chain (h-dvh + overflow-hidden + inner
          // overflow-y-auto) clipped content with no recovery in some
          // browser/zoom states. The sticky sidebar and header keep their
          // positions during document scroll; only `fill` pages (app-like
          // panes that manage their own internal scrolling) keep the chain.
          "lg:grid lg:grid-cols-[250px_minmax(0,1fr)]",
          fill ? "h-full" : "min-h-dvh"
        )}
      >
        <aside
          ref={drawerRef}
          inert={!isDesktopNav && !navOpen}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col gap-4 border-r border-border bg-card p-3 transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0 lg:shadow-none",
            navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
          )}
          aria-label="Workspace navigation"
        >
          <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-2 px-2.5 py-2">
            {platformSection ? (
              <PlatformStatusCard
                platform={platformSection}
                status={platformStatusForSection}
              />
            ) : (
              <>
                {activePublishingPage ? (
                  <PageAvatar
                    page={activePublishingPage}
                    className="size-8 rounded-lg text-[11px]"
                  />
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink font-heading text-sm font-semibold text-paper">
                    {initials(workspaceName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold leading-tight">
                    {activePublishingPage?.name ?? workspaceName}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">
                    {activePublishingPage
                      ? `Publishing · ${workspaceName}`
                      : workspace?.role === "editor"
                        ? "Editor workspace"
                        : "Owner workspace"}
                  </p>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="tap-target grid size-7 place-items-center rounded-md text-faint hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {showFacebookTools ? (
            <Link
              href="/"
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand text-[12.5px] font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Plus className="size-4" aria-hidden />
              New post
            </Link>
          ) : platformSection ? (
            <Link
              href={`/${platformSection}`}
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand text-[12.5px] font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Plus className="size-4" aria-hidden />
              {platformSection === "youtube"
                ? "New upload"
                : platformSection === "instagram"
                  ? "New Instagram post"
                  : "New TikTok post"}
            </Link>
          ) : null}

          <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-1">
            {navGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-0.5">
                <p className="px-2.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
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
                        {Icon ? (
                          <Icon
                            className="size-4 shrink-0 text-faint"
                            aria-hidden
                          />
                        ) : null}
                        {item.label}
                        <span className="ml-auto rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
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
                        "flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        active
                          ? "bg-brand-soft font-semibold text-brand-strong shadow-[inset_2px_0_0_var(--brand)]"
                          : "text-secondary-foreground hover:bg-surface-3 hover:text-foreground"
                      )}
                    >
                      {item.mark ? (
                        <PlatformMark
                          platform={item.mark}
                          className="size-[18px] shrink-0"
                        />
                      ) : Icon ? (
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-brand" : "text-muted-foreground"
                          )}
                          aria-hidden
                        />
                      ) : null}
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
              className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Publishing
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {platformSection ? (
                  <PlatformStatusCard
                    platform={platformSection}
                    status={platformStatusForSection}
                    compact
                  />
                ) : (
                  <>
                    {activePublishingPage ? (
                      <PageAvatar page={activePublishingPage} className="size-5 text-[8px]" />
                    ) : (
                      <FacebookMark className="size-5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold leading-tight">
                        {connection.loading
                          ? "Checking…"
                          : connection.connected
                            ? (activePublishingPage?.name ?? connection.page?.name)
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
                  </>
                )}
                <ChevronRight className="size-3.5 text-faint" aria-hidden />
              </div>
            </Link>

            <div ref={accountRef} className="relative">
              <button
                type="button"
                ref={accountTriggerRef}
                onClick={() =>
                  accountOpen ? setAccountOpen(false) : setAccountOpen(true)
                }
                aria-expanded={accountOpen}
                aria-haspopup="dialog"
                className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
                  ref={accountPanelRef}
                  role="dialog"
                  aria-label="Account"
                  className="absolute inset-x-0 bottom-[calc(100%+6px)] z-50 rounded-lg border border-border bg-card p-1 shadow-lg"
                >
                  <p className="truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                    {session?.user?.email ?? "Owner account"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <LogOut className="size-3.5" aria-hidden />
                    {signingOut ? "Signing out…" : "Sign out"}
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
            onClick={() => {
              setNavOpen(false);
              hamburgerRef.current?.focus();
            }}
            className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          />
        )}

        <div className={cn("flex min-h-0 min-w-0 flex-col", fill && "lg:h-full")}>
          <header className="sticky top-0 z-30 flex h-[58px] shrink-0 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              ref={hamburgerRef}
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              className="tap-target grid size-8 place-items-center rounded-[7px] border border-border bg-card text-secondary-foreground hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
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
              {platformSection ? (
                <PlatformQuickNav
                  platform={platformSection}
                  status={platformStatusForSection}
                />
              ) : showFacebookTools ? (
                <>
                  <StoryQueueQuickLink />
                  <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
                  <PublishQuickNav />
                </>
              ) : null}
              <NotificationBell />
              {!platformSection && <FacebookConnectionButton />}
            </div>
          </header>

          <main
            id="main-content"
            className={cn(
              // fill pages: app-like pane, exact viewport height, internal
              // areas scroll. Regular pages: content-sized — the document
              // itself scrolls, so nothing can clip below the fold.
              fill ? "flex min-h-0 flex-1 flex-col overflow-clip" : "flex flex-col"
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

// The sidebar card for sections that publish somewhere other than the shared
// Facebook Page: YouTube uploads go to the connected channel, TikTok posts to
// the connected account, Instagram publishes through the Page's linked
// professional account — so the card reports that platform's own state
// instead of a Facebook Page that has nothing to do with it. The status is
// fetched once in AppFrame and shared with PlatformQuickNav.
type PlatformStatus = {
  configured: boolean;
  connected: boolean;
  account?: { id?: string; name?: string } | null;
  ig?: { username: string } | null;
  reason?: string | null;
};

function platformStateLine(
  platform: PlatformSection,
  status: PlatformStatus | null
) {
  if (!status) return "Checking…";
  if (!status.configured) return "Setup needed";
  if (platform === "instagram") {
    if (!status.connected) {
      return status.reason === "no_ig_account"
        ? "No IG linked to the Page"
        : "Not connected";
    }
    return status.ig?.username ? `@${status.ig.username}` : "Connected";
  }
  return status.connected ? (status.account?.name ?? "Connected") : "Not connected";
}

function platformLabel(platform: PlatformSection) {
  return platform === "youtube"
    ? "YouTube"
    : platform === "instagram"
      ? "Instagram"
      : "TikTok";
}

function PlatformStatusCard({
  platform,
  status,
  compact = false,
}: {
  platform: PlatformSection;
  status: PlatformStatus | null;
  compact?: boolean;
}) {
  const label = platformLabel(platform);
  const state = platformStateLine(platform, status);

  if (compact) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PlatformMark platform={platform} className="size-5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight">
            {label}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {state}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <PlatformMark platform={platform} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold leading-tight">
          Publishing · {label}
        </p>
        <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">
          {state}
        </p>
      </div>
    </div>
  );
}

// Header quick-nav for the platform studios, mirroring the Facebook pair
// (Story Queue + Publish dropdown): a link to the studio's composer plus,
// when the platform is connected and its public URL is derivable, an
// external link to the profile/channel itself.
const PLATFORM_QUICK_NAV: Record<
  PlatformSection,
  { href: string; label: string; externalLabel: string | null }
> = {
  instagram: {
    href: "/instagram",
    label: "Instagram post",
    externalLabel: "Open profile",
  },
  youtube: {
    href: "/youtube",
    label: "Upload video",
    externalLabel: "Open channel",
  },
  tiktok: {
    href: "/tiktok",
    label: "TikTok post",
    externalLabel: null,
  },
};

function platformExternalHref(
  platform: PlatformSection,
  status: PlatformStatus | null
): string | null {
  if (!status?.connected) return null;
  if (platform === "instagram") {
    return status.ig?.username
      ? `https://instagram.com/${status.ig.username}`
      : null;
  }
  if (platform === "youtube") {
    const id = status.account?.id;
    return id && id !== "unknown"
      ? `https://www.youtube.com/channel/${id}`
      : null;
  }
  return null;
}

function PlatformQuickNav({
  platform,
  status,
}: {
  platform: PlatformSection;
  status: PlatformStatus | null;
}) {
  const pathname = usePathname();
  const config = PLATFORM_QUICK_NAV[platform];
  const external = platformExternalHref(platform, status);
  const active = pathname === config.href || pathname.startsWith(`${config.href}/`);
  const externalLabel =
    platform === "youtube"
      ? "Open channel"
      : platform === "instagram"
        ? "Open profile"
        : null;

  return (
    <nav
      aria-label={`${platformLabel(platform)} publishing tools`}
      className="flex items-center gap-1.5"
    >
      <Link
        href={config.href}
        aria-label={config.label}
        aria-current={active ? "page" : undefined}
        title={config.label}
        className="tap-target grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-auto sm:rounded-lg sm:px-2.5"
      >
        <PlatformMark platform={platform} className="size-4" />
        <span className="hidden text-[11.5px] font-semibold sm:inline">
          {config.label}
        </span>
      </Link>
      {external && externalLabel ? (
        <a
          href={external}
          target="_blank"
          rel="noreferrer"
          aria-label={externalLabel}
          title={externalLabel}
          className="tap-target grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-auto sm:rounded-lg sm:px-2.5"
        >
          <ExternalLink className="size-4" aria-hidden />
          <span className="hidden text-[11.5px] font-semibold sm:inline">
            {externalLabel}
          </span>
        </a>
      ) : null}
    </nav>
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
        "flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = useCallback(
    (reason: "escape" | "outside") => {
      setOpen(false);
      if (reason === "escape") triggerRef.current?.focus();
    },
    [setOpen]
  );

  useDismissable(open, close, containerRef);

  useEffect(() => {
    if (!open) return;
    if (panelRef.current) focusFirstIn(panelRef.current);
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
                "flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1 rounded-[7px] border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
      >
        Publish
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Publishing tools"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {PUBLISH_LINKS.map(({ href, label, hint, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(
    (reason: "escape" | "outside") => {
      setMenuOpen(false);
      if (reason === "escape") triggerRef.current?.focus();
    },
    [setMenuOpen]
  );

  useDismissable(menuOpen, closeMenu, menuRef);

  useEffect(() => {
    if (!menuOpen) return;
    if (panelRef.current) focusFirstIn(panelRef.current);
  }, [menuOpen]);

  function handleClick() {
    if (!connection.connected) {
      connection.connect();
      return;
    }
    setMenuOpen((open) => !open);
  }

  const title = connection.connected
    ? `Facebook: ${connection.page?.name ?? "connected"}`
    : status.label;

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        ref={triggerRef}
        onClick={handleClick}
        aria-label={
          connection.connected
            ? "Manage Facebook Page connection"
            : "Connect Facebook Page"
        }
        aria-expanded={connection.connected ? menuOpen : undefined}
        aria-haspopup={connection.connected ? "dialog" : undefined}
        title={title}
        className="tap-target-tight relative grid size-8 shrink-0 place-items-center rounded-[7px] border border-border bg-card transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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

      {menuOpen && connection.connected && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Facebook Page connection"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          <p className="truncate text-[12px] font-semibold">
            {connection.page?.name ?? "Facebook Page"}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            Connected — posts publish to this Page.
          </p>
          <div className="mt-2.5 flex justify-end">
            <ConfirmButton
              size="sm"
              variant="ghost"
              onConfirm={() => {
                setMenuOpen(false);
                return connection.disconnect();
              }}
              confirmLabel="Confirm disconnect"
              busyLabel="Disconnecting…"
              className="h-7 px-2 text-[11px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              Disconnect
            </ConfirmButton>
          </div>
        </div>
      )}
    </div>
  );
}
