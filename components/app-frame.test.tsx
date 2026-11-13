// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mockReplace = vi.fn();
const mockRefresh = vi.fn();
const { pathnameRef } = vi.hoisted(() => ({
  pathnameRef: { current: "/" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => pathnameRef.current,
}));

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { name: "Roel Somido", email: "roel@example.com" } },
    }),
    signOut: signOutMock,
  },
}));

vi.mock("@/components/facebook-connection", () => ({
  useFacebookConnection: () => ({
    loading: false,
    connecting: false,
    refreshing: false,
    unreachable: false,
    configured: true,
    connected: false,
    page: null,
    scopes: [],
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  FacebookConnectionProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/notifications", () => ({
  NotificationBell: () => null,
}));

vi.mock("@/components/facebook-mark", () => ({
  FacebookMark: () => <span data-testid="fb-mark" />,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { toast } from "sonner";
import { AppFrame } from "./app-frame";

async function flush() {
  await act(async () => {});
}

async function openAccountMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Roel Somido/ }));
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  }
  // /api/workspace — the frame tolerates a failed load and falls back.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, json: async () => ({}) }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AppFrame sign out", () => {
  it("signs out once, then redirects to login", async () => {
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();
    await openAccountMenu();

    let release!: (value: unknown) => void;
    signOutMock.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; })
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await flush();

    const pending = screen.getByRole("button", { name: "Signing out…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    await flush();

    release(undefined);
    await flush();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("stays put with a toast when signing out fails", async () => {
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();
    await openAccountMenu();

    signOutMock.mockRejectedValueOnce(new Error("Network down"));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await flush();

    expect(toast.error).toHaveBeenCalledWith("Could not sign out", {
      description: "Please try again.",
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});

describe("AppFrame publishing card", () => {
  function stubFetchWith(payloads: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        for (const [needle, payload] of Object.entries(payloads)) {
          if (url.includes(needle)) {
            return { ok: true, json: async () => payload };
          }
        }
        return { ok: false, json: async () => ({}) };
      })
    );
  }

  it("reports the platform state instead of the Facebook Page on /youtube", async () => {
    pathnameRef.current = "/youtube";
    stubFetchWith({
      "/api/youtube/status": {
        configured: true,
        connected: false,
        account: null,
        scopes: [],
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(screen.getByText("Publishing · YouTube")).toBeInTheDocument();
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
  });

  it("names the connected channel when YouTube is live", async () => {
    pathnameRef.current = "/youtube";
    stubFetchWith({
      "/api/youtube/status": {
        configured: true,
        connected: true,
        account: { id: "uc-1", name: "Roel's Channel" },
        scopes: [],
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(screen.getByText("Publishing · YouTube")).toBeInTheDocument();
    expect(screen.getAllByText("Roel's Channel").length).toBeGreaterThan(0);
    expect(screen.queryByText("The Daily Buzz")).not.toBeInTheDocument();
  });

  it("does the same for TikTok on /tiktok", async () => {
    pathnameRef.current = "/tiktok";
    stubFetchWith({
      "/api/tiktok/status": {
        configured: true,
        connected: false,
        account: null,
        scopes: [],
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(screen.getByText("Publishing · TikTok")).toBeInTheDocument();
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
  });

  it("reports the linked IG account on /instagram", async () => {
    pathnameRef.current = "/instagram";
    stubFetchWith({
      "/api/instagram/status": {
        configured: true,
        connected: true,
        ig: { id: "ig-1", username: "iamwowie_", picture: null },
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(screen.getByText("Publishing · Instagram")).toBeInTheDocument();
    expect(screen.getAllByText("@iamwowie_").length).toBeGreaterThan(0);
    expect(screen.queryByText("The Daily Buzz")).not.toBeInTheDocument();
  });

  it("says when the Page has no Instagram linked", async () => {
    pathnameRef.current = "/instagram";
    stubFetchWith({
      "/api/instagram/status": {
        configured: true,
        connected: false,
        ig: null,
        reason: "no_ig_account",
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(screen.getByText("Publishing · Instagram")).toBeInTheDocument();
    expect(
      screen.getAllByText("No IG linked to the Page").length
    ).toBeGreaterThan(0);
  });

  it("keeps the Facebook Page card on Facebook-family routes", async () => {
    pathnameRef.current = "/post";
    stubFetchWith({});
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(screen.queryByText("Publishing · YouTube")).not.toBeInTheDocument();
    expect(screen.queryByText("Publishing · TikTok")).not.toBeInTheDocument();
    // The workspace fallback name shows while no Page is selected.
    expect(screen.getAllByText(/News Workbench/).length).toBeGreaterThan(0);
  });
});

describe("AppFrame platform nav", () => {
  function stubFetchWith(payloads: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        for (const [needle, payload] of Object.entries(payloads)) {
          if (url.includes(needle)) {
            return { ok: true, json: async () => payload };
          }
        }
        return { ok: false, json: async () => ({}) };
      })
    );
  }

  it("lists the platform studios in the sidebar on Facebook routes too", async () => {
    pathnameRef.current = "/post";
    stubFetchWith({});
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      "/instagram"
    );
    expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute(
      "href",
      "/youtube"
    );
  });

  it("shows a platform quick-nav with an external channel link on /youtube", async () => {
    pathnameRef.current = "/youtube";
    stubFetchWith({
      "/api/youtube/status": {
        configured: true,
        connected: true,
        account: { id: "UC123", name: "Roel's Channel" },
        scopes: [],
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    const upload = screen.getByRole("link", { name: "Upload video" });
    expect(upload).toHaveAttribute("href", "/youtube");
    const channel = screen.getByRole("link", { name: "Open channel" });
    expect(channel).toHaveAttribute(
      "href",
      "https://www.youtube.com/channel/UC123"
    );
    expect(channel).toHaveAttribute("target", "_blank");
    // The composer CTA is platform-aware.
    expect(screen.getByText("New upload")).toBeInTheDocument();
    // The Facebook-only header control hides inside platform studios.
    expect(
      screen.queryByRole("button", { name: "Connect Facebook Page" })
    ).not.toBeInTheDocument();
  });

  it("omits the external channel link when the channel id is unknown", async () => {
    pathnameRef.current = "/youtube";
    stubFetchWith({
      "/api/youtube/status": {
        configured: true,
        connected: true,
        account: { id: "unknown", name: "YouTube" },
        scopes: [],
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    expect(
      screen.getByRole("link", { name: "Upload video" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open channel" })
    ).not.toBeInTheDocument();
  });

  it("links the Instagram profile and swaps the CTA on /instagram", async () => {
    pathnameRef.current = "/instagram";
    stubFetchWith({
      "/api/instagram/status": {
        configured: true,
        connected: true,
        ig: { id: "ig-1", username: "iamwowie_", picture: null },
      },
    });
    render(
      <AppFrame>
        <p>Page body</p>
      </AppFrame>
    );
    await flush();

    const profile = screen.getByRole("link", { name: "Open profile" });
    expect(profile).toHaveAttribute("href", "https://instagram.com/iamwowie_");
    expect(screen.getByText("New Instagram post")).toBeInTheDocument();
  });
});
