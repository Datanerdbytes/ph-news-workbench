// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { Modal } from "./modal";

afterEach(cleanup);

function Harness({
  open,
  onClose,
  initialFocus = false,
}: {
  open: boolean;
  onClose: () => void;
  initialFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button type="button">Trigger</button>
      <Modal
        open={open}
        onClose={onClose}
        title="Test dialog"
        initialFocusRef={initialFocus ? inputRef : undefined}
      >
        {initialFocus ? (
          <input ref={inputRef} aria-label="Name" />
        ) : (
          <button type="button">Action</button>
        )}
      </Modal>
    </div>
  );
}

describe("Modal", () => {
  it("renders a modal dialog labelled by its title", () => {
    render(<Harness open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders nothing while closed", () => {
    render(<Harness open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("focuses the initial-focus element, else the first focusable", () => {
    const { rerender } = render(
      <Harness open onClose={() => {}} initialFocus />
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Name");

    rerender(<Harness open={false} onClose={() => {}} />);
    rerender(<Harness open onClose={() => {}} />);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
  });

  it("returns focus to the trigger on close", () => {
    const { rerender } = render(<Harness open onClose={() => {}} />);
    rerender(<Harness open={false} onClose={() => {}} />);
    expect(document.activeElement?.textContent).toBe("Trigger");
  });

  it("closes on Escape and outside pointerdown, not inside clicks", () => {
    const onClose = vi.fn();
    const { container } = render(<Harness open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(container.querySelector('[role="dialog"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab inside the panel", () => {
    render(<Harness open onClose={() => {}} />);
    const action = screen.getByRole("button", { name: "Action" });
    action.focus();
    fireEvent.keyDown(action, { key: "Tab" });
    // Tab from the last focusable wraps to the first (the Close button).
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement?.textContent).toBe("Action");
  });
});
