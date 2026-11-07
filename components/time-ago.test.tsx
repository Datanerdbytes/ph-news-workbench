// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeAgo } from "./time-ago";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TimeAgo", () => {
  it("shows relative labels and keeps the dateTime attribute", () => {
    render(<TimeAgo date="2026-11-07T11:45:00Z" />);
    expect(screen.getByText("15m ago")).toBeInTheDocument();
    const time = screen.getByText("15m ago").closest("time")!;
    expect(time).toHaveAttribute("dateTime", "2026-11-07T11:45:00.000Z");
  });

  it("re-renders as time passes", () => {
    render(<TimeAgo date="2026-11-07T11:45:00Z" />);
    expect(screen.getByText("15m ago")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(370_000); // 15m → 21m
    });
    expect(screen.getByText("21m ago")).toBeInTheDocument();
  });

  it("follows a changed date prop", () => {
    const { rerender } = render(<TimeAgo date="2026-11-07T11:45:00Z" />);
    expect(screen.getByText("15m ago")).toBeInTheDocument();

    rerender(<TimeAgo date="2026-11-07T09:45:00Z" />);
    expect(screen.getByText("2h ago")).toBeInTheDocument();
  });

  it("renders an empty label for invalid dates", () => {
    const { container } = render(<TimeAgo date="not a date" />);
    const time = container.querySelector("time")!;
    expect(time.textContent).toBe("");
  });
});
