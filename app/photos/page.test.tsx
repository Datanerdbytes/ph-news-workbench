// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ReactNode } from "react";

const mockPages = [
  { id: "p1", name: "NeuralVerse", picture: null },
  { id: "p2", name: "The Daily Buzz", picture: null },
];

const mockSelectOne = vi.fn();

vi.mock("@/components/publishing/publish-page", () => ({
  PublishPage: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ComposerCard: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  PageSelector: () => null,
  ScheduleField: () => null,
  ResultList: () => null,
  FieldLabel: ({ htmlFor, children }: { htmlFor?: string; children?: ReactNode }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  defaultScheduleValue: () => "2026-11-07T12:00",
  inputClass: "",
  textareaClass: "",
  useManagedPages: () => ({
    pages: mockPages,
    selected: ["p1"],
    selectOne: mockSelectOne,
    loading: false,
  }),
}));

vi.mock("@/components/facebook-connection", () => ({
  useFacebookConnection: () => ({ connected: true, loading: false }),
}));

// Prop-dump stubs — the assertions check what the page threads into previews.
vi.mock("@/components/facebook-preview", () => ({
  FacebookPreview: ({
    text,
    imageUrls,
    pageName,
  }: {
    text?: string;
    imageUrls?: string[];
    pageName?: string;
  }) => (
    <div
      data-testid="fb-post-preview"
      data-text={text ?? ""}
      data-page={pageName ?? ""}
      data-images={String(imageUrls?.length ?? 0)}
    />
  ),
}));

vi.mock("@/components/facebook-album-preview", () => ({
  FacebookAlbumPreview: ({
    albumName,
    description,
    imageUrls,
    pageName,
    photoCount,
  }: {
    albumName?: string;
    description?: string;
    imageUrls?: string[];
    pageName?: string;
    photoCount?: number | null;
  }) => (
    <div
      data-testid="fb-album-preview"
      data-album={albumName ?? ""}
      data-page={pageName ?? ""}
      data-count={
        photoCount === null || photoCount === undefined
          ? "none"
          : String(photoCount)
      }
      data-desc={description ?? ""}
      data-images={String(imageUrls?.length ?? 0)}
    />
  ),
}));

vi.mock("@/components/assistant-chat", () => ({
  AssistantChat: () => null,
}));

import PhotosPage from "./page";

async function flush() {
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/photos/albums")) {
        return {
          ok: true,
          json: async () => ({
            albums: [
              {
                id: "al1",
                name: "Behind the newsroom",
                count: 4,
                createdTime: null,
                link: null,
              },
            ],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PhotosPage previews", () => {
  it("renders the Facebook post preview on the Photo posts tab", async () => {
    render(<PhotosPage />);
    await flush();

    const preview = screen.getByTestId("fb-post-preview");
    expect(preview).toHaveAttribute("data-page", "NeuralVerse");
    expect(preview).toHaveAttribute("data-images", "0");
    expect(screen.queryByTestId("fb-album-preview")).not.toBeInTheDocument();
  });

  it("switches to the album preview on the Albums tab", async () => {
    render(<PhotosPage />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Albums" }));
    await flush();

    const album = screen.getByTestId("fb-album-preview");
    expect(album).toHaveAttribute("data-album", "");
    expect(album).toHaveAttribute("data-count", "none");
    expect(screen.queryByTestId("fb-post-preview")).not.toBeInTheDocument();
  });

  it("threads the selected album, caption, and photo arithmetic", async () => {
    render(<PhotosPage />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Albums" }));
    await flush();

    fireEvent.change(screen.getByLabelText("Album"), {
      target: { value: "al1" },
    });
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Launch week highlights" },
    });
    fireEvent.change(screen.getByLabelText("Images"), {
      target: {
        files: [
          new File(["a"], "one.png", { type: "image/png" }),
          new File(["b"], "two.png", { type: "image/png" }),
        ],
      },
    });
    // FileReader fires on a macrotask — poll until the images attach.
    await waitFor(() =>
      expect(screen.getByTestId("fb-album-preview")).toHaveAttribute(
        "data-images",
        "2"
      )
    );

    const album = screen.getByTestId("fb-album-preview");
    expect(album).toHaveAttribute("data-album", "Behind the newsroom");
    expect(album).toHaveAttribute("data-desc", "Launch week highlights");
    // 4 photos already in the album + the 2 just selected
    expect(album).toHaveAttribute("data-count", "6");
    expect(album).toHaveAttribute("data-images", "2");
  });

  it("mirrors the caption into the post preview while typing", async () => {
    render(<PhotosPage />);
    await flush();

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Hello feed" },
    });

    expect(screen.getByTestId("fb-post-preview")).toHaveAttribute(
      "data-text",
      "Hello feed"
    );
    expect(mockSelectOne).not.toHaveBeenCalled();
  });
});
