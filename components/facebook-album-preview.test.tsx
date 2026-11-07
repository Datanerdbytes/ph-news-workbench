// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FacebookAlbumPreview } from "./facebook-album-preview";

afterEach(cleanup);

describe("FacebookAlbumPreview", () => {
  it("shows the connection state in the header and footer", () => {
    const { rerender } = render(
      <FacebookAlbumPreview albumName="Album" description="x" connected />
    );
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(
      screen.getByText("Page connected — photos land in the selected album.")
    ).toBeInTheDocument();

    rerender(
      <FacebookAlbumPreview albumName="Album" description="x" connected={false} />
    );
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(
      screen.getByText("Preview only — connect your Facebook Page to publish.")
    ).toBeInTheDocument();
  });

  it("renders the album name, page identity, and description", () => {
    render(
      <FacebookAlbumPreview
        albumName="Behind the newsroom"
        description="Photo essays from the field"
        pageName="NeuralVerse"
      />
    );
    expect(screen.getByText("Behind the newsroom")).toBeInTheDocument();
    expect(screen.getByText("NeuralVerse")).toBeInTheDocument();
    expect(screen.getByText("Photo essays from the field")).toBeInTheDocument();
  });

  it("falls back to an untitled album when the name is blank", () => {
    const { rerender } = render(<FacebookAlbumPreview albumName="   " />);
    expect(screen.getByText("Untitled album")).toBeInTheDocument();

    rerender(<FacebookAlbumPreview />);
    expect(screen.getByText("Untitled album")).toBeInTheDocument();
  });

  it("renders the photo count with correct pluralization", () => {
    const { rerender } = render(
      <FacebookAlbumPreview albumName="A" photoCount={12} />
    );
    expect(screen.getByText("12 photos")).toBeInTheDocument();

    rerender(<FacebookAlbumPreview albumName="A" photoCount={1} />);
    expect(screen.getByText("1 photo")).toBeInTheDocument();
  });

  it("hides the count segment before any photos exist", () => {
    render(<FacebookAlbumPreview albumName="A" />);
    expect(screen.queryByText("0 photos")).not.toBeInTheDocument();
    expect(screen.getByText("Just now")).toBeInTheDocument();
  });

  it("uses placeholders when the caption or grid is empty", () => {
    render(<FacebookAlbumPreview albumName="A" imageUrls={[]} />);
    expect(
      screen.getByText("The album caption will appear here.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Photos you add will appear here.")
    ).toBeInTheDocument();
  });

  it("grids up to nine photos with a +N overflow badge", () => {
    const urls = Array.from(
      { length: 12 },
      (_, i) => `https://cdn.example/${i + 1}.jpg`
    );
    render(<FacebookAlbumPreview albumName="A" imageUrls={urls} />);

    // No page picture here, so every <img> is an album tile.
    expect(screen.getAllByRole("img")).toHaveLength(9);
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("passes data URLs through to the tiles untouched", () => {
    render(
      <FacebookAlbumPreview
        albumName="A"
        imageUrls={["data:image/png;base64,QUJD"]}
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "data:image/png;base64,QUJD"
    );
  });
});
