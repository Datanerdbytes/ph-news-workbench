// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmButton, ConfirmIconButton } from "./confirm-button";

afterEach(cleanup);

describe("ConfirmButton (text mode)", () => {
  it("does not fire on the first click; fires on confirm", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton onConfirm={onConfirm} confirmLabel="Confirm delete">
        Delete draft
      </ConfirmButton>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

    // Back to the idle state once the action settles.
    expect(
      screen.getByRole("button", { name: "Delete draft" })
    ).toBeInTheDocument();
  });

  it("cancel returns to idle without firing", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton onConfirm={onConfirm}>Revoke</ConfirmButton>);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
  });

  it("shows the busy label and disables while pending", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((res) => (resolve = res))
    );
    render(
      <ConfirmButton onConfirm={onConfirm} busyLabel="Deleting…">
        Delete
      </ConfirmButton>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolve();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled()
    );
  });

  it("disabled controls never arm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton onConfirm={onConfirm} disabled>
        End stream
      </ConfirmButton>
    );

    const button = screen.getByRole("button", { name: "End stream" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(
      screen.queryByRole("button", { name: "Confirm" })
    ).not.toBeInTheDocument();
  });

  it("Escape on the armed confirm button disarms", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton onConfirm={onConfirm} confirmLabel="Confirm delete">
        Delete
      </ConfirmButton>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Confirm delete" }),
      { key: "Escape" }
    );

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("ConfirmIconButton (icon mode)", () => {
  it("arms on first click, confirms on second, announces the armed state", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmIconButton
        onConfirm={onConfirm}
        idleLabel="Cancel scheduled post"
        armedLabel="Click again to cancel this scheduled post"
        icon={<span>x</span>}
      />
    );

    const button = screen.getByRole("button", {
      name: "Cancel scheduled post",
    });
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();

    const armed = screen.getByRole("button", {
      name: "Click again to cancel this scheduled post",
    });
    expect(armed).toBeInTheDocument();
    fireEvent.click(armed);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "Cancel scheduled post" })
    ).toBeInTheDocument();
  });

  it("Escape disarms and the arm auto-resets", () => {
    vi.useFakeTimers();
    try {
      const onConfirm = vi.fn();
      render(
        <ConfirmIconButton
          onConfirm={onConfirm}
          idleLabel="Remove"
          resetMs={4000}
          icon={<span>x</span>}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      fireEvent.keyDown(
        screen.getByRole("button", { name: "Click again to confirm" }),
        { key: "Escape" }
      );
      expect(
        screen.getByRole("button", { name: "Remove" })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      // Back to idle after the reset window — a click now would only re-arm.
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(onConfirm).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disabled controls never arm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmIconButton
        onConfirm={onConfirm}
        idleLabel="Remove"
        disabled
        icon={<span>x</span>}
      />
    );

    const button = screen.getByRole("button", { name: "Remove" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(
      screen.queryByRole("button", { name: "Click again to confirm" })
    ).not.toBeInTheDocument();
  });
});
