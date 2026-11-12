// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import {
  focusFirstIn,
  trapTabFocus,
  useDismissable,
} from "./dialog-a11y";

afterEach(cleanup);

describe("useDismissable", () => {
  function Panel({ onClose }: { onClose: (reason: string) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useDismissable(true, onClose, ref);
    return (
      <div ref={ref}>
        <button type="button">Inside</button>
      </div>
    );
  }

  it("closes on Escape and reports the reason", () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith("escape");
  });

  it("closes on pointer-down outside the container", () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledWith("outside");
  });

  it("ignores interactions inside the container", () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Inside" }));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("focusFirstIn", () => {
  it("focuses the first focusable element", () => {
    const container = document.createElement("div");
    const second = document.createElement("button");
    const first = document.createElement("a");
    first.href = "#first";
    container.append(first, second);
    document.body.append(container);

    expect(focusFirstIn(container)).toBe(first);
    expect(document.activeElement).toBe(first);
    container.remove();
  });

  it("falls back to the container itself", () => {
    const container = document.createElement("div");
    document.body.append(container);

    expect(focusFirstIn(container)).toBe(container);
    expect(document.activeElement).toBe(container);
    expect(container.getAttribute("tabindex")).toBe("-1");
    container.remove();
  });
});

describe("trapTabFocus", () => {
  function makeContainer() {
    const container = document.createElement("div");
    const first = document.createElement("button");
    const last = document.createElement("button");
    container.append(first, last);
    document.body.append(container);
    return { container, first, last };
  }

  it("wraps Tab from the last element back to the first", () => {
    const { container, first, last } = makeContainer();
    last.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab" });
    const preventDefault = vi.spyOn(event, "preventDefault");
    trapTabFocus(container, event);
    expect(preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
    container.remove();
  });

  it("wraps Shift+Tab from the first element back to the last", () => {
    const { container, first, last } = makeContainer();
    first.focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
    });
    trapTabFocus(container, event);
    expect(document.activeElement).toBe(last);
    container.remove();
  });

  it("ignores non-Tab keys", () => {
    const { container, first } = makeContainer();
    const event = new KeyboardEvent("keydown", { key: "Enter" });
    const preventDefault = vi.spyOn(event, "preventDefault");
    trapTabFocus(container, event);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(first);
    container.remove();
  });
});

describe("inert attribute", () => {
  it("renders a boolean inert prop as the HTML attribute", () => {
    function Probe({ closed }: { closed: boolean }) {
      return <aside inert={closed} aria-label="probe" />;
    }
    const { rerender } = render(<Probe closed />);
    expect(
      screen.getByLabelText("probe").hasAttribute("inert")
    ).toBe(true);

    act(() => {
      rerender(<Probe closed={false} />);
    });
    expect(
      screen.getByLabelText("probe").hasAttribute("inert")
    ).toBe(false);
  });
});
