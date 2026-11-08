// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformMark } from "@/components/platform-mark";

vi.mock("@/components/app-frame", async () => {
  const { createElement } = await import("react");
  return {
    AppFrame: ({ children }: React.PropsWithChildren) =>
      createElement("div", null, children),
  };
});

import {
  PlatformPublishPage,
  type PlatformConnectionState,
} from "./publish-page";

afterEach(cleanup);

const connection = (
  overrides: Partial<PlatformConnectionState> = {}
): PlatformConnectionState => ({
  loading: false,
  connected: false,
  configured: true,
  unreachable: false,
  connect: vi.fn(),
  ...overrides,
});

function renderPage(state: Partial<PlatformConnectionState> = {}) {
  return render(
    <PlatformPublishPage
      eyebrow="Publishing"
      title="Instagram"
      mark={<PlatformMark platform="instagram" className="size-7" />}
      platformName="Instagram"
      gateHint="Publishing tools post with the Instagram Graph API, so a business account must be connected first."
      connectLabel="Connect Instagram"
      connection={connection(state)}
    >
      <p>composer body</p>
    </PlatformPublishPage>
  );
}

describe("PlatformPublishPage", () => {
  it("routes connected users straight to the composer", () => {
    renderPage({ connected: true });
    expect(screen.getByText("composer body")).toBeInTheDocument();
    expect(screen.queryByText("Connect Instagram")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton while the connection resolves", () => {
    renderPage({ loading: true });
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(
      document.querySelector('div[class*="animate-pulse"]')
    ).not.toBeNull();
    expect(screen.queryByText("composer body")).not.toBeInTheDocument();
  });

  it("branded gate prompts to connect and wires the CTA", () => {
    const connect = vi.fn();
    renderPage({ connect });
    expect(screen.getAllByText("Connect Instagram").length).toBe(2);
    expect(
      screen.getByText(
        "Publishing tools post with the Instagram Graph API, so a business account must be connected first."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Instagram" }));
    expect(connect).toHaveBeenCalledOnce();
  });

  it("explains unconfigured environments without a CTA", () => {
    renderPage({ configured: false });
    expect(screen.getByText("Instagram is not configured")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add the Instagram app credentials to this environment before publishing."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Instagram" })
    ).not.toBeInTheDocument();
  });
});
