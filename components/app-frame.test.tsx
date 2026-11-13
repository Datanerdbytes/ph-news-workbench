// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mockReplace = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => "/",
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
