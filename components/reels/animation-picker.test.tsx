// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";

vi.mock("@/lib/reels/presets.preview", () => ({
  mountPreset: vi.fn(() => null),
}));
vi.mock("@/components/publishing/publish-page", () => ({
  FieldLabel: ({
    htmlFor,
    children,
  }: {
    htmlFor?: string;
    children?: ReactNode;
  }) => <label htmlFor={htmlFor}>{children}</label>,
  inputClass: "",
}));

import { AnimationPicker, type SlotLoops, type SlotSelection } from "./animation-picker";
import { defaultPresetValues } from "@/lib/reels/presets";

/**
 * Stateful harness so slot assignment round-trips through the same handlers
 * the reels page wires up (select → editor block → remove).
 */
function Harness({
  onFieldChange = vi.fn(),
}: {
  onFieldChange?: (presetId: string, key: string, text: string) => void;
}) {
  const [slots, setSlots] = useState<SlotSelection>({
    start: null,
    middle: null,
    end: null,
  });
  const [loops, setLoops] = useState<SlotLoops>({
    start: false,
    middle: false,
    end: false,
  });
  return (
    <AnimationPicker
      slots={slots}
      loops={loops}
      values={defaultPresetValues()}
      onSelect={(slot, id) => setSlots((current) => ({ ...current, [slot]: id }))}
      onLoopChange={(slot, loop) => setLoops((current) => ({ ...current, [slot]: loop }))}
      onFieldChange={onFieldChange}
    />
  );
}

function slotTab(name: "Start" | "Middle" | "End"): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function presetCard(name: string): HTMLButtonElement {
  // Preset cards carry no aria-label; the editor's remove buttons do —
  // filter them out so /Kinetic Headline/ doesn't match "Remove Kinetic
  // Headline from the start slot".
  const card = screen
    .getAllByRole("button", { name: new RegExp(name) })
    .find((el) => el.getAttribute("aria-label") === null);
  if (!card) throw new Error(`No preset card matching ${name}`);
  return card as HTMLButtonElement;
}

afterEach(cleanup);

describe("AnimationPicker", () => {
  it("opens on the start slot and only offers start-compatible presets", () => {
    render(<Harness />);
    expect(slotTab("Start").getAttribute("aria-pressed")).toBe("true");
    expect(presetCard("Kinetic Headline")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /End Card/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Quote Reveal/ })).toBeNull();
  });

  it("switches the gallery to the chosen slot's compatible presets", () => {
    render(<Harness />);
    fireEvent.click(slotTab("End"));
    expect(presetCard("End Card")).toBeTruthy();
    expect(presetCard("Logo Sting")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Kinetic Headline/ })).toBeNull();
  });

  it("attaches a preset to the active slot and shows its editor", () => {
    render(<Harness />);
    fireEvent.click(presetCard("Kinetic Headline"));
    expect(presetCard("Kinetic Headline").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Headline text")).toBeTruthy();
    // Tap the same card again to detach it.
    fireEvent.click(presetCard("Kinetic Headline"));
    expect(screen.queryByLabelText("Headline text")).toBeNull();
  });

  it("clears the active slot from the None card", () => {
    render(<Harness />);
    fireEvent.click(slotTab("End"));
    fireEvent.click(presetCard("End Card"));
    expect(screen.getByLabelText("End card text")).toBeTruthy();
    fireEvent.click(presetCard("Clear slot"));
    expect(screen.queryByLabelText("End card text")).toBeNull();
  });

  it("toggles looping for the start slot", () => {
    render(<Harness />);
    fireEvent.click(presetCard("Kinetic Headline"));
    const loop = screen.getByRole("checkbox") as HTMLInputElement;
    expect(loop.checked).toBe(false);
    fireEvent.click(loop);
    expect(loop.checked).toBe(true);
    expect(
      screen.getByText(/Repeats about every 3.8s through the rest of the reel/)
    ).toBeTruthy();
  });

  it("offers no loop toggle in the end slot — the end effect closes the reel", () => {
    render(<Harness />);
    fireEvent.click(slotTab("End"));
    fireEvent.click(presetCard("End Card"));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("Plays last 4s.")).toBeTruthy();
  });

  it("flags cards that are attached to another slot", () => {
    render(<Harness />);
    fireEvent.click(presetCard("Logo Sting"));
    fireEvent.click(slotTab("End"));
    expect(presetCard("Logo Sting").textContent).toContain("start");
  });

  it("gives same-preset editors unique input ids per slot", () => {
    render(<Harness />);
    fireEvent.click(presetCard("Logo Sting")); // start slot
    fireEvent.click(slotTab("End"));
    fireEvent.click(presetCard("Logo Sting")); // end slot
    const startInput = document.getElementById(
      "preset-start-logosting-text"
    ) as HTMLInputElement | null;
    const endInput = document.getElementById(
      "preset-end-logosting-text"
    ) as HTMLInputElement | null;
    if (!startInput || !endInput) throw new Error("both slot editors should render inputs");
    expect(startInput.id).not.toBe(endInput.id);
    // Each label points at its own slot's input.
    const startLabel = document.querySelector(
      'label[for="preset-start-logosting-text"]'
    );
    const endLabel = document.querySelector(
      'label[for="preset-end-logosting-text"]'
    );
    expect(startLabel && endLabel).toBeTruthy();
  });

  it("edits field values through onFieldChange", () => {
    const onFieldChange = vi.fn();
    render(<Harness onFieldChange={onFieldChange} />);
    fireEvent.click(presetCard("Kinetic Headline"));
    fireEvent.change(screen.getByLabelText("Headline text"), {
      target: { value: "Flood aid arrives" },
    });
    expect(onFieldChange).toHaveBeenCalledWith("headline", "text", "Flood aid arrives");
  });

  it("filters the gallery by category", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Branding" }));
    expect(presetCard("Logo Sting")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Kinetic Headline/ })).toBeNull();
  });

  it("removes an attachment from its editor's remove button", () => {
    render(<Harness />);
    fireEvent.click(presetCard("Kinetic Headline"));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Kinetic Headline from the start slot" })
    );
    expect(screen.queryByLabelText("Headline text")).toBeNull();
    // Removing selection reveals the slot's empty hint again.
    expect(screen.getByText("Pick an animation that opens the reel.")).toBeTruthy();
  });
});
