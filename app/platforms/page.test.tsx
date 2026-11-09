// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

function connection(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    connected: false,
    configured: true,
    unreachable: false,
    connect: vi.fn(),
    ...overrides,
  };
}

const mockConnections = {
  facebook: connection(),
  instagram: connection(),
  youtube: connection(),
  tiktok: connection(),
};

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/app-frame", () => ({
  AppFrame: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/platform-mark", () => ({
  PlatformMark: () => null,
}));

vi.mock("@/components/facebook-connection", () => ({
  useFacebookConnection: () => mockConnections.facebook,
}));

vi.mock("@/components/instagram-connection", () => ({
  useInstagramConnection: () => mockConnections.instagram,
}));

vi.mock("@/components/youtube-connection", () => ({
  useYouTubeConnection: () => mockConnections.youtube,
}));

vi.mock("@/components/tiktok-connection", () => ({
  useTikTokConnection: () => mockConnections.tiktok,
}));

import PlatformsPage from "./page";

beforeEach(() => {
  mockConnections.facebook = connection();
  mockConnections.instagram = connection();
  mockConnections.youtube = connection();
  mockConnections.tiktok = connection();
});

afterEach(cleanup);

describe("platform card actions", () => {
  it("shows a Launch link to the platform studio when connected", () => {
    mockConnections.facebook = connection({
      connected: true,
      page: { name: "NeuralVerse", id: "123" },
    });
    mockConnections.instagram = connection({
      connected: true,
      ig: { username: "iamwowie_" },
      pageId: "123",
    });
    mockConnections.youtube = connection({
      connected: true,
      account: { name: "News channel", id: "uc1" },
    });
    mockConnections.tiktok = connection({
      connected: true,
      account: { name: "newsdesk", id: "tt1" },
      publicPostingApproved: true,
    });

    render(<PlatformsPage />);

    const launches: [string, string][] = [
      ["Launch Facebook", "/post"],
      ["Launch Instagram", "/instagram"],
      ["Launch YouTube", "/youtube"],
      ["Launch TikTok", "/tiktok"],
    ];
    for (const [label, href] of launches) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveTextContent("Launch");
    }
    expect(
      screen.queryByRole("button", { name: "Connect Facebook" })
    ).toBeNull();
  });

  it("shows an enabled Connect button when configured but not connected", () => {
    render(<PlatformsPage />);

    for (const name of ["Facebook", "Instagram", "YouTube", "TikTok"]) {
      expect(
        screen.getByRole("button", { name: `Connect ${name}` })
      ).toBeEnabled();
    }

    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));
    expect(mockConnections.facebook.connect).toHaveBeenCalledTimes(1);
  });

  it("disables Connect when the platform credentials are missing", () => {
    mockConnections.youtube = connection({ configured: false });

    render(<PlatformsPage />);

    expect(
      screen.getByRole("button", { name: "Connect YouTube" })
    ).toBeDisabled();
  });

  it("shows a disabled Checking… button while status loads", () => {
    mockConnections.tiktok = connection({ loading: true });

    render(<PlatformsPage />);

    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });

  it("keeps LinkedIn gated without a launch destination", () => {
    render(<PlatformsPage />);

    expect(
      screen.getByRole("button", { name: "Connect LinkedIn" })
    ).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Launch LinkedIn" })).toBeNull();
  });
});