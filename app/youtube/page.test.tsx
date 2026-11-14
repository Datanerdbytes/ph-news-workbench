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
  // Interactive stub: the page drives the schedule toggle through these
  // props, and submit-time validation runs through resolveScheduledFor.
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
      aria-label="Schedule on YouTube"
      checked={enabled}
      onChange={(event) => onEnabled(event.target.checked)}
    />
  ),
  defaultScheduleValue: () => "2026-11-15T09:00",
  resolveScheduledFor: (value: string) =>
    value ? `${value}:00.000Z` : null,
  inputClass: "",
  textareaClass: "",
  mediaFileError: () => null,
}));
vi.mock("@/components/youtube-connection", () => ({
  useYouTubeConnection: () => ({
    connected: true,
    loading: false,
    account: { id: "UC1", name: "My Channel" },
  }),
}));
vi.mock("@/components/youtube-preview", () => ({
  YouTubePreview: () => null,
}));

import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import YouTubePage from "./page";

const uploadMock = upload as unknown as Mock;
const fetchMock = vi.fn();

async function flush() {
  await act(async () => {});
}

function stageVideo() {
  uploadMock.mockResolvedValue({
    url: "https://bucket.public.blob.vercel-storage.com/youtube/v.mp4",
  });
  const input = document.querySelector<HTMLInputElement>("#yt-video")!;
  fireEvent.change(input, {
    target: {
      files: [new File(["bytes"], "clip.mp4", { type: "video/mp4" })],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "vid_1",
      permalink: "https://www.youtube.com/watch?v=vid_1",
      scheduledFor: null,
      account: { id: "UC1", name: "My Channel" },
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("YouTubePage composer", () => {
  it("publishes now with the picked visibility and no schedule field", async () => {
    render(<YouTubePage />);
    await flush();

    stageVideo();
    await flush();

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Newsroom cut" },
    });
    fireEvent.change(screen.getByLabelText("Visibility"), {
      target: { value: "public" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Publish to YouTube" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/youtube/videos");
    expect(JSON.parse(String(init.body))).toMatchObject({
      title: "Newsroom cut",
      privacyStatus: "public",
    });
    expect(JSON.parse(String(init.body)).scheduledFor).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith(
      "Published to YouTube",
      expect.anything()
    );
  });

  it("sends the scheduled time and forces private visibility when scheduling", async () => {
    render(<YouTubePage />);
    await flush();

    stageVideo();
    await flush();

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Newsroom cut" },
    });
    fireEvent.click(screen.getByLabelText("Schedule on YouTube"));

    const button = screen.getByRole("button", { name: "Schedule video" });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/youtube/videos");
    expect(JSON.parse(String(init.body))).toMatchObject({
      title: "Newsroom cut",
      privacyStatus: "private",
      scheduledFor: "2026-11-15T09:00:00.000Z",
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Video scheduled on YouTube",
      expect.anything()
    );
  });

  it("locks the visibility picker to Private while scheduling", async () => {
    render(<YouTubePage />);
    await flush();

    stageVideo();
    await flush();

    expect(
      (screen.getByLabelText("Visibility") as HTMLSelectElement).disabled
    ).toBe(false);

    fireEvent.click(screen.getByLabelText("Schedule on YouTube"));

    const select = screen.getByLabelText("Visibility") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("private");
  });
});
