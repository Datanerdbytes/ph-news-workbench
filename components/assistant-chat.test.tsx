// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantChat } from "./assistant-chat";

let resolveChat: ((value: unknown) => void) | null = null;
let rejectChat: ((reason: unknown) => void) | null = null;
const chatFetch = vi.fn(
  () =>
    new Promise((resolve, reject) => {
      resolveChat = resolve;
      rejectChat = reject;
    })
);

function respond(payload: unknown) {
  act(() => {
    resolveChat?.({ ok: true, json: async () => payload });
  });
  return act(async () => {});
}

async function openPanel() {
  fireEvent.click(screen.getByRole("button"));
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", chatFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AssistantChat", () => {
  it("labels the send button for chat mode vs revision mode", async () => {
    const chat = render(<AssistantChat />);
    await openPanel();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    chat.unmount();

    render(<AssistantChat draft="Current draft text" onDraftChange={vi.fn()} />);
    await openPanel();
    expect(
      screen.getByRole("button", { name: "Send revision request" })
    ).toBeDisabled();
  });

  it("offers mode-appropriate suggestion chips", async () => {
    render(<AssistantChat />);
    await openPanel();
    expect(
      screen.getByRole("button", { name: "Give me story ideas" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Make it shorter" })
    ).toBeNull();
  });

  it("announces the busy bubble while waiting", async () => {
    const onDraftChange = vi.fn();
    render(<AssistantChat draft="A caption" onDraftChange={onDraftChange} />);
    await openPanel();

    fireEvent.change(
      screen.getByLabelText("Ask the assistant to write or revise"),
      { target: { value: "Punch it up" } }
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send revision request" })
    );
    await act(async () => {});

    expect(screen.getByRole("status")).toHaveTextContent("Revising…");
    expect(
      screen.getByRole("button", { name: "Send revision request" })
    ).toBeDisabled();

    await respond({ text: "Punchier caption" });

    expect(
      screen.getByText("Draft updated. The revision is in the draft panel.")
    ).toBeInTheDocument();
    expect(onDraftChange).toHaveBeenCalledWith("Punchier caption");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the mode-aware busy label in chat mode", async () => {
    render(<AssistantChat />);
    await openPanel();

    fireEvent.change(screen.getByLabelText("Message the assistant"), {
      target: { value: "Story ideas?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => {});

    expect(screen.getByRole("status")).toHaveTextContent("Thinking…");
    await respond({ text: "Try a local-angle hook." });
    expect(screen.getByText("Try a local-angle hook.")).toBeInTheDocument();
  });

  it("surfaces the assistant's error text in the thread", async () => {
    render(<AssistantChat />);
    await openPanel();

    fireEvent.change(screen.getByLabelText("Message the assistant"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => {});

    act(() => {
      rejectChat?.(new Error("Assistant is asleep"));
    });
    await act(async () => {});

    expect(screen.getByText("Assistant is asleep")).toBeInTheDocument();
  });
});
