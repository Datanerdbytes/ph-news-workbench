// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { YouTubePreview } from "./youtube-preview";

afterEach(cleanup);

describe("YouTubePreview", () => {
  it("shows the placeholder, privacy chip, and title prompt while empty", () => {
    render(
      <YouTubePreview
        videoUrl={null}
        title=""
        privacy="private"
      />
    );
    expect(screen.getByText("No video selected yet")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Your title appears here…")).toBeInTheDocument();
  });

  it("previews the staged video bytes, title, and channel row", () => {
    render(
      <YouTubePreview
        videoUrl="https://blob/public/youtube/newsroom.mp4"
        title="Senate budget hearing, day two"
        channelName="NeuralVerse"
        privacy="public"
      />
    );
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute(
      "src",
      "https://blob/public/youtube/newsroom.mp4"
    );
    expect(screen.getByText("Senate budget hearing, day two")).toBeInTheDocument();
    expect(screen.getByText("NeuralVerse")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
  });
});
