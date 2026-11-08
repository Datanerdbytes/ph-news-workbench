// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TikTokPreview } from "./tiktok-preview";

afterEach(cleanup);

describe("TikTokPreview", () => {
  it("shows the placeholder and caption prompt while empty", () => {
    render(<TikTokPreview videoUrl={null} caption="" handle="@yourhandle" />);
    expect(screen.getByText("TikTok feed preview")).toBeInTheDocument();
    expect(screen.getByText("Your caption appears here…")).toBeInTheDocument();
    expect(screen.getByText("@yourhandle")).toBeInTheDocument();
  });

  it("previews the staged vertical post with caption and handle", () => {
    render(
      <TikTokPreview
        videoUrl="https://blob/public/tiktok/newsroom.mp4"
        caption="Budget override at midnight"
        handle="@NeuralVerse"
        thumbnail={null}
      />
    );
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute(
      "src",
      "https://blob/public/tiktok/newsroom.mp4"
    );
    expect(screen.getByText("Budget override at midnight")).toBeInTheDocument();
    expect(screen.getByText("@NeuralVerse")).toBeInTheDocument();
  });

  it("falls back to the initial-letter avatar when no thumbnail exists", () => {
    render(
      <TikTokPreview videoUrl={null} caption="" handle="@NeuralVerse" />
    );
    expect(screen.getByText("N")).toBeInTheDocument();
  });
});
