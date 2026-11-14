// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ReactNode } from "react";

vi.mock("@vercel/blob/client", () => ({
  upload: vi.fn(),
}));
vi.mock("@/lib/blob-cleanup", () => ({ deleteStagedBlob: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/components/publishing/publish-page", () => ({
  PlatformPublishPage: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  ComposerCard: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  ResultList: () => null,
  FieldLabel: ({
    htmlFor,
    children,
  }: {
    htmlFor?: string;
    children?: ReactNode;
  }) => <label htmlFor={htmlFor}>{children}</label>,
  ScheduleField: ({
    enabled,
    onEnabled,
  }: {
    enabled: boolean;
    onEnabled: (value: boolean) => void;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      type="checkbox"
      aria-label="Schedule on Instagram"
      checked={enabled}
      onChange={(event) => onEnabled(event.target.checked)}
    />
  ),
  defaultScheduleValue: () => "2026-11-15T09:00",
  resolveScheduledFor: (value: string) => (value ? `${value}:00.000Z` : null),
  inputClass: "",
  textareaClass: "",
}));
vi.mock("@/components/instagram-connection", () => ({
  useInstagramConnection: () => ({
    connected: true,
    loading: false,
    ig: { username: "iamwowie_" },
    reason: null,
    detail: null,
  }),
}));
vi.mock("@/components/instagram-preview", () => ({
  InstagramPreview: () => null,
}));

import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import InstagramPage from "./page";

const uploadMock = upload as unknown as Mock;
const fetchMock = vi.fn();

async function flush() {
  await act(async () => {});
}

function stageImage() {
  uploadMock.mockResolvedValue({
    url: "https://bucket.public.blob.vercel-storage.com/instagram/img.jpg",
  });
  const input = document.querySelector<HTMLInputElement>("#ig-image")!;
  fireEvent.change(input, {
    target: {
      files: [new File(["bytes"], "photo.jpg", { type: "image/jpeg" })],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "ig_media_1",
      permalink: "https://www.instagram.com/p/xyz",
      account: { name: "iamwowie_" },
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InstagramPage composer", () => {
  it("publishes now without a schedule field", async () => {
    render(<InstagramPage />);
    await flush();

    stageImage();
    await flush();

    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Behind the headline" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Publish to Instagram" })
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/instagram/posts");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      message: "Behind the headline",
      imageUrl: "https://bucket.public.blob.vercel-storage.com/instagram/img.jpg",
    });
    expect(body.scheduledFor).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith(
      "Posted to Instagram",
      expect.anything()
    );
  });

  it("sends the scheduled time when scheduling", async () => {
    render(<InstagramPage />);
    await flush();

    stageImage();
    await flush();

    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Behind the headline" },
    });
    fireEvent.click(screen.getByLabelText("Schedule on Instagram"));

    fireEvent.click(screen.getByRole("button", { name: "Schedule post" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.scheduledFor).toBe("2026-11-15T09:00:00.000Z");
    expect(toast.success).toHaveBeenCalledWith(
      "Instagram post scheduled",
      expect.anything()
    );
  });
});
