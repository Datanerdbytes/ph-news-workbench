// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorState } from "./error-state";

afterEach(cleanup);

describe("ErrorState", () => {
  it("renders title and default copy", () => {
    render(<ErrorState />);
    expect(screen.getByText("Couldn't load this data")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides the retry button without onRetry", () => {
    render(<ErrorState title="Couldn't load drafts" />);
    expect(screen.getByText("Couldn't load drafts")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("fires onRetry and shows the busy label while retrying", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ErrorState onRetry={onRetry} title="Couldn't load drafts" />
    );

    const button = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <ErrorState onRetry={onRetry} retrying title="Couldn't load drafts" />
    );
    expect(
      screen.getByRole("button", { name: "Retrying…" })
    ).toBeDisabled();
  });
});
