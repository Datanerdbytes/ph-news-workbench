// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlatformMark } from "./platform-mark";

afterEach(cleanup);

describe("PlatformMark", () => {
  it("renders a decorative tile for every platform", () => {
    const expectations: Record<string, string> = {
      facebook: "bg-facebook",
      instagram: "bg-[linear-gradient(135deg,#f9ce34_0%,#ee2a7b_55%,#6228d7_100%)]",
      youtube: "bg-youtube",
      tiktok: "bg-tiktok",
      linkedin: "bg-linkedin",
    };

    for (const [platform, tileClass] of Object.entries(expectations)) {
      const { container } = render(
        <PlatformMark platform={platform as "facebook"} />
      );
      const tile = container.firstElementChild!;
      expect(tile.getAttribute("aria-hidden")).toBe("true");
      expect(tile.className).toContain(tileClass);
      cleanup();
    }
  });

  it("shows the linkedin wordmark as text", () => {
    render(<PlatformMark platform="linkedin" />);
    expect(screen.getByText("in")).toBeInTheDocument();
  });

  it("draws an svg glyph for the other platforms", () => {
    for (const platform of ["facebook", "instagram", "youtube", "tiktok"] as const) {
      const { container } = render(<PlatformMark platform={platform} />);
      expect(container.querySelector("svg")).not.toBeNull();
      cleanup();
    }
  });

  it("appends caller classes to the tile", () => {
    const { container } = render(
      <PlatformMark platform="facebook" className="size-12" />
    );
    expect(container.firstElementChild!.className).toContain("size-12");
  });
});
